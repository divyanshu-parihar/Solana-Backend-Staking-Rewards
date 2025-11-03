import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgramService } from '@modules/program/program.service';
import * as anchor from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RewardsService {
  private readonly logger = new Logger(RewardsService.name);

  constructor(
    private prisma: PrismaService,
    private programService: ProgramService,
    private configService: ConfigService,
  ) {}

  async claimRewards(wallet: string, positionSeed: number, nftSeed?: number) {
    try {
      const ownerPubkey = this.programService.convertToPublicKey(wallet);
      const positionSeedBN = new anchor.BN(positionSeed);

      const [stakePositionPda] = this.programService.findStakePositionPda(
        ownerPubkey,
        positionSeedBN,
      );

      const position = await this.prisma.stakePosition.findUnique({
        where: { pda: stakePositionPda.toString() },
      });

      if (!position) {
        throw new NotFoundException('Stake position not found');
      }

      if (!position.isActive) {
        throw new BadRequestException('Stake position is not active');
      }

      const now = Math.floor(Date.now() / 1000);
      const weekInSeconds = 7 * 24 * 60 * 60;
      const lastClaim = position.lastClaimTs
        ? Number(position.lastClaimTs)
        : Number(position.startTs);

      if (now < lastClaim + weekInSeconds) {
        const remaining = lastClaim + weekInSeconds - now;
        throw new BadRequestException(
          `Must wait 7 days between claims. ${Math.ceil(remaining / 3600)} hours remaining.`,
        );
      }

      const programState = await this.prisma.programState.findFirst();

      if (!programState) {
        throw new BadRequestException('Program state not initialized');
      }

      const stakingPower = Number(position.stakingPower);
      const totalStakingPower = Number(programState.totalStakingPower);
      const rewardPool = Number(programState.totalRewardPool);

      const timeElapsed = now - Number(position.lastRewardTs);
      const weeksElapsed = Math.floor(timeElapsed / weekInSeconds);

      if (weeksElapsed === 0) {
        throw new BadRequestException('No rewards accrued yet');
      }

      const rewardAmount = this.calculateProRataReward(
        stakingPower,
        totalStakingPower,
        rewardPool,
        weeksElapsed,
      );

      if (rewardAmount === 0) {
        throw new BadRequestException('No rewards available');
      }

      const seed = nftSeed || Date.now();
      const nftSeedBN = new anchor.BN(seed);

      const [rewardNftPda] = this.programService.findRewardNftPda(ownerPubkey, nftSeedBN);

      const vestingPeriod = this.configService.get<number>('staking.vestingPeriod') || 31536000;
      const vestTimestamp = now + vestingPeriod;

      const rewardNft = await this.prisma.rewardNft.create({
        data: {
          id: uuidv4(),
          owner: wallet,
          pda: rewardNftPda.toString(),
          nftAsset: PublicKey.default.toString(),
          rewardAmount: BigInt(rewardAmount),
          vestTs: BigInt(vestTimestamp),
          isActive: true,
          nftSeed: BigInt(seed),
          positionId: position.id,
        },
      });

      await this.prisma.stakePosition.update({
        where: { pda: stakePositionPda.toString() },
        data: {
          lastRewardTs: BigInt(now),
          lastClaimTs: BigInt(now),
        },
      });

      if (process.env.NODE_ENV === 'test') {
        const msg = `[TEST] ✓ Rewards claimed: Position ${position.pda}, Amount: ${rewardAmount}, Weeks: ${weeksElapsed}, NFT: ${rewardNft.pda}`;
        console.log(msg);
        this.logger.log(msg);
      } else {
        this.logger.log(`Rewards claimed for position: ${position.pda}`);
      }

      return {
        rewardNftId: rewardNft.id,
        pda: rewardNft.pda,
        nftSeed: seed,
        rewardAmount,
        vestTimestamp,
        weeksElapsed,
        message: 'Rewards claimed successfully. NFT vesting receipt will be created on-chain.',
      };
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      const isExpectedError =
        error instanceof BadRequestException || error instanceof NotFoundException;

      if (!isTestMode || !isExpectedError) {
        this.logger.error(`Claim rewards error: ${error.message}`, error.stack);
      }
      throw error;
    }
  }

  async vestReward(wallet: string, nftSeed: number) {
    try {
      const ownerPubkey = this.programService.convertToPublicKey(wallet);
      const nftSeedBN = new anchor.BN(nftSeed);

      const [rewardNftPda] = this.programService.findRewardNftPda(ownerPubkey, nftSeedBN);

      const rewardNft = await this.prisma.rewardNft.findUnique({
        where: { pda: rewardNftPda.toString() },
      });

      if (!rewardNft) {
        throw new NotFoundException('Reward NFT not found');
      }

      if (!rewardNft.isActive) {
        throw new BadRequestException('Reward NFT already vested');
      }

      const now = Math.floor(Date.now() / 1000);
      if (now < Number(rewardNft.vestTs)) {
        const remaining = Number(rewardNft.vestTs) - now;
        const daysRemaining = Math.ceil(remaining / (24 * 60 * 60));
        throw new BadRequestException(
          `Vesting period not complete. ${daysRemaining} days remaining (1 year total).`,
        );
      }

      await this.prisma.rewardNft.update({
        where: { pda: rewardNftPda.toString() },
        data: {
          isActive: false,
        },
      });

      if (process.env.NODE_ENV === 'test') {
        const msg = `[TEST] ✓ Reward NFT vested: ${rewardNft.pda}, Amount: ${rewardNft.rewardAmount.toString()}`;
        console.log(msg);
        this.logger.log(msg);
      } else {
        this.logger.log(`Reward NFT vested: ${rewardNft.pda}`);
      }

      return {
        rewardNftId: rewardNft.id,
        pda: rewardNft.pda,
        amount: rewardNft.rewardAmount.toString(),
        message:
          'Vesting complete. Please sign and submit the transaction to receive your rewards.',
      };
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      const isExpectedError =
        error instanceof BadRequestException || error instanceof NotFoundException;

      if (!isTestMode || !isExpectedError) {
        this.logger.error(`Vest reward error: ${error.message}`, error.stack);
      }
      throw error;
    }
  }

  async getRewardNfts(wallet?: string, isActive?: boolean) {
    try {
      const where: any = {};

      if (wallet) {
        where.owner = wallet;
      }

      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      const nfts = await this.prisma.rewardNft.findMany({
        where,
        include: {
          user: {
            select: {
              wallet: true,
            },
          },
          position: {
            select: {
              positionSeed: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return nfts.map((nft) => ({
        id: nft.id,
        pda: nft.pda,
        owner: nft.owner,
        nftAsset: nft.nftAsset,
        rewardAmount: nft.rewardAmount.toString(),
        vestTs: nft.vestTs.toString(),
        isActive: nft.isActive,
        nftSeed: nft.nftSeed.toString(),
        positionSeed: nft.position?.positionSeed.toString() || null,
        createdAt: nft.createdAt,
      }));
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      const isExpectedError =
        error instanceof BadRequestException || error instanceof NotFoundException;

      if (!isTestMode || !isExpectedError) {
        this.logger.error(`Get reward NFTs error: ${error.message}`, error.stack);
      }
      throw error;
    }
  }

  private calculateProRataReward(
    userStakingPower: number,
    totalStakingPower: number,
    rewardPool: number,
    weeks: number,
  ): number {
    if (totalStakingPower === 0 || userStakingPower === 0) {
      return 0;
    }

    const weeklyEmissionRate = 21;
    const emissionPrecision = 10000;

    const weeklyPoolEmission = Math.floor((rewardPool * weeklyEmissionRate) / emissionPrecision);
    const userWeeklyShare = Math.floor((weeklyPoolEmission * userStakingPower) / totalStakingPower);
    const totalReward = userWeeklyShare * weeks;

    return this.applyApyCap(userStakingPower, totalReward, weeks);
  }

  private applyApyCap(stakedAmount: number, rewardAmount: number, weeks: number): number {
    if (weeks === 0) {
      return rewardAmount;
    }

    const maxApyBasisPoints = 7500;
    const annualizedRate = Math.floor((rewardAmount * 52 * 10000) / (stakedAmount * weeks));

    if (annualizedRate > maxApyBasisPoints) {
      const cappedReward = Math.floor((stakedAmount * maxApyBasisPoints * weeks) / (10000 * 52));
      return cappedReward;
    }

    return rewardAmount;
  }
}
