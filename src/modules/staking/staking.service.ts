import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgramService } from '@modules/program/program.service';
import * as anchor from '@coral-xyz/anchor';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StakingService {
  private readonly logger = new Logger(StakingService.name);

  constructor(
    private prisma: PrismaService,
    private programService: ProgramService,
    private configService: ConfigService,
  ) {}

  async stakeTokens(
    wallet: string,
    amount: number,
    durationMonths: number,
    tierId: number,
    isLocked: boolean,
    positionSeed?: number,
  ) {
    try {
      const ownerPubkey = this.programService.convertToPublicKey(wallet);

      const seed = positionSeed || Date.now();
      const positionSeedBN = new anchor.BN(seed);

      const [stakePositionPda] = this.programService.findStakePositionPda(
        ownerPubkey,
        positionSeedBN,
      );

      const tier = await this.prisma.stakingTier.findUnique({
        where: { tierId },
      });

      if (!tier || !tier.isActive) {
        throw new BadRequestException('Staking tier not active or does not exist');
      }

      if (durationMonths < tier.minMonths || durationMonths > tier.maxMonths) {
        throw new BadRequestException(
          `Duration must be between ${tier.minMonths} and ${tier.maxMonths} months for this tier`,
        );
      }

      const powerMultiplier = this.calculatePowerMultiplier(durationMonths);
      const stakingPower = Math.floor((amount * powerMultiplier) / 100);

      const now = Math.floor(Date.now() / 1000);
      const unlockTimestamp = now + durationMonths * 30 * 24 * 60 * 60;

      const stakePosition = await this.prisma.stakePosition.create({
        data: {
          id: uuidv4(),
          owner: wallet,
          pda: stakePositionPda.toString(),
          amount: BigInt(amount),
          durationMonths,
          tierId,
          isLocked,
          powerMultiplier: BigInt(powerMultiplier),
          stakingPower: BigInt(stakingPower),
          startTs: BigInt(now),
          unlockTs: BigInt(unlockTimestamp),
          lastRewardTs: BigInt(now),
          lastClaimTs: BigInt(now),
          cooldownEnd: null,
          pendingPrincipal: null,
          isActive: true,
          positionSeed: BigInt(seed),
        },
      });

      if (process.env.NODE_ENV === 'test') {
        const msg = `[TEST] ✓ Stake position created: ${stakePosition.pda}, Amount: ${amount}, Power: ${stakingPower}`;
        console.log(msg);
        this.logger.log(msg);
      } else {
        this.logger.log(`Stake position created: ${stakePosition.pda}`);
      }

      return {
        positionId: stakePosition.id,
        pda: stakePosition.pda,
        positionSeed: seed,
        amount,
        durationMonths,
        powerMultiplier,
        stakingPower,
        unlockTimestamp,
        message: 'Stake position created. Please sign and submit the transaction on-chain.',
      };
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      const isExpectedError =
        error instanceof BadRequestException || error instanceof NotFoundException;

      if (!isTestMode || !isExpectedError) {
        this.logger.error(`Stake tokens error: ${error.message}`, error.stack);
      }
      throw error;
    }
  }

  async unstakeTokens(wallet: string, positionSeed: number) {
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

      if (position.cooldownEnd && position.cooldownEnd > 0) {
        throw new BadRequestException('Cooldown already active for this position');
      }

      const now = Math.floor(Date.now() / 1000);
      const cooldownPeriod = this.configService.get<number>('staking.cooldownPeriod') ?? 604800;
      const cooldownEnd = now + cooldownPeriod;

      const isEarlyUnstake = now < Number(position.unlockTs);

      // Calculate penalty for early unstake
      let penaltyAmount = 0;
      let toRewardPool = 0;
      let toProtocol = 0;
      let principalAfterPenalty = Number(position.amount);

      if (isEarlyUnstake) {
        const tierMultiplier = this.getTierPenaltyMultiplier(position.tierId);
        penaltyAmount = Math.floor((Number(position.amount) * tierMultiplier) / 10000);

        // Split penalty 50% to reward pool / 50% to protocol
        toRewardPool = Math.floor(penaltyAmount / 2);
        toProtocol = Math.floor(penaltyAmount / 2);

        principalAfterPenalty = Number(position.amount) - penaltyAmount;

        // Create penalty transaction record
        await this.prisma.penaltyTransaction.create({
          data: {
            positionId: position.id,
            wallet,
            penaltyAmount: BigInt(penaltyAmount),
            toRewardPool: BigInt(toRewardPool),
            toProtocol: BigInt(toProtocol),
            tierMultiplier,
          },
        });

        // Update reward pool with 50% of penalty
        const programState = await this.prisma.programState.findFirst();
        if (programState) {
          await this.prisma.programState.update({
            where: { id: programState.id },
            data: {
              totalRewardPool: {
                increment: BigInt(toRewardPool),
              },
            },
          });
        }

        this.logger.log(
          `Early unstake penalty applied: ${penaltyAmount} (Tier ${position.tierId}, ${tierMultiplier / 100}%)`,
        );
      }

      await this.prisma.stakePosition.update({
        where: { pda: stakePositionPda.toString() },
        data: {
          cooldownEnd: BigInt(cooldownEnd),
          pendingPrincipal: BigInt(principalAfterPenalty),
          isActive: false,
        },
      });

      if (process.env.NODE_ENV === 'test') {
        const msg = `[TEST] ✓ Unstake initiated: ${position.pda}, Cooldown ends: ${new Date(cooldownEnd * 1000).toISOString()}`;
        console.log(msg);
        this.logger.log(msg);
      } else {
        this.logger.log(`Unstake initiated for position: ${position.pda}`);
      }

      return {
        positionId: position.id,
        pda: position.pda,
        cooldownEnd,
        isEarlyUnstake,
        message:
          'Unstake initiated. Cooldown period started. Please sign and submit the transaction on-chain.',
      };
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      const isExpectedError =
        error instanceof BadRequestException || error instanceof NotFoundException;

      if (!isTestMode || !isExpectedError) {
        this.logger.error(`Unstake tokens error: ${error.message}`, error.stack);
      }
      throw error;
    }
  }

  async finalizeUnstake(wallet: string, positionSeed: number) {
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

      if (position.isActive) {
        throw new BadRequestException('Position is still active');
      }

      if (!position.cooldownEnd || position.cooldownEnd === BigInt(0)) {
        throw new BadRequestException('No cooldown active for this position');
      }

      const now = Math.floor(Date.now() / 1000);
      if (now < Number(position.cooldownEnd)) {
        const remaining = Number(position.cooldownEnd) - now;
        throw new BadRequestException(
          `Cooldown period not complete. ${Math.ceil(remaining / 3600)} hours remaining.`,
        );
      }

      await this.prisma.stakePosition.update({
        where: { pda: stakePositionPda.toString() },
        data: {
          cooldownEnd: BigInt(0),
          pendingPrincipal: BigInt(0),
          amount: BigInt(0),
        },
      });

      if (process.env.NODE_ENV === 'test') {
        const msg = `[TEST] ✓ Unstake finalized: ${position.pda}, Amount returned: ${position.pendingPrincipal?.toString() || '0'}`;
        console.log(msg);
        this.logger.log(msg);
      } else {
        this.logger.log(`Unstake finalized for position: ${position.pda}`);
      }

      return {
        positionId: position.id,
        pda: position.pda,
        amount: position.pendingPrincipal?.toString() || '0',
        message:
          'Unstake finalized. Please sign and submit the transaction to receive your tokens.',
      };
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      const isExpectedError =
        error instanceof BadRequestException || error instanceof NotFoundException;

      if (!isTestMode || !isExpectedError) {
        this.logger.error(`Finalize unstake error: ${error.message}`, error.stack);
      }
      throw error;
    }
  }

  async getPositions(wallet?: string, isActive?: boolean) {
    try {
      const where: any = {};

      if (wallet) {
        where.owner = wallet;
      }

      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      const positions = await this.prisma.stakePosition.findMany({
        where,
        include: {
          tier: true,
          user: {
            select: {
              wallet: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return positions.map((pos) => ({
        id: pos.id,
        pda: pos.pda,
        owner: pos.owner,
        amount: pos.amount.toString(),
        durationMonths: pos.durationMonths,
        tierId: pos.tierId,
        isLocked: pos.isLocked,
        powerMultiplier: pos.powerMultiplier.toString(),
        stakingPower: pos.stakingPower.toString(),
        startTs: pos.startTs.toString(),
        unlockTs: pos.unlockTs.toString(),
        lastRewardTs: pos.lastRewardTs.toString(),
        cooldownEnd: pos.cooldownEnd?.toString() || null,
        pendingPrincipal: pos.pendingPrincipal?.toString() || null,
        isActive: pos.isActive,
        positionSeed: pos.positionSeed.toString(),
        tier: pos.tier
          ? {
              id: pos.tier.id,
              tierId: pos.tier.tierId,
              multiplier: pos.tier.multiplier.toString(),
              minMonths: pos.tier.minMonths,
              maxMonths: pos.tier.maxMonths,
              isActive: pos.tier.isActive,
            }
          : null,
        createdAt: pos.createdAt,
      }));
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      const isExpectedError =
        error instanceof BadRequestException || error instanceof NotFoundException;

      if (!isTestMode || !isExpectedError) {
        this.logger.error(`Get positions error: ${error.message}`, error.stack);
      }
      throw error;
    }
  }

  private calculatePowerMultiplier(durationMonths: number): number {
    if (durationMonths >= 1 && durationMonths <= 5) return 100;
    if (durationMonths >= 6 && durationMonths <= 11) return 150;
    if (durationMonths >= 12 && durationMonths <= 17) return 200;
    if (durationMonths >= 18 && durationMonths <= 23) return 250;
    if (durationMonths >= 24 && durationMonths <= 35) return 300;
    if (durationMonths >= 36) return 400;
    return 100;
  }

  private getTierPenaltyMultiplier(tierId: number): number {
    // Return basis points (10000 = 100%)
    const tierPenalties: Record<number, number> = {
      1: 500, // 5% for tier 1 (1-3 months)
      2: 750, // 7.5% for tier 2 (6-12 months)
      3: 1000, // 10% for tier 3 (12-24 months)
      4: 1250, // 12.5% for tier 4 (24+ months)
    };
    return tierPenalties[tierId] || 500;
  }
}
