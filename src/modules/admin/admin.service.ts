import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ProgramService } from '@modules/program/program.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma: PrismaService,
    private programService: ProgramService,
    private configService: ConfigService,
  ) {}

  private checkAdminAccess(wallet: string) {
    const adminKeypair = this.programService.getAdminKeypair();
    const adminWallet = adminKeypair ? adminKeypair.publicKey.toString() : null;

    if (!adminWallet) {
      this.logger.warn(`Admin wallet not configured. Access attempt from ${wallet}`);
      throw new ForbiddenException('Admin wallet not configured');
    }

    if (wallet !== adminWallet) {
      this.logger.warn(`Unauthorized admin access attempt from ${wallet} (admin: ${adminWallet})`);
      throw new ForbiddenException('Admin access required');
    }
  }

  async createTier(
    wallet: string,
    tierId: number,
    multiplier: number,
    minMonths: number,
    maxMonths: number,
    isActive: boolean = true,
  ) {
    this.checkAdminAccess(wallet);

    try {
      if (minMonths > maxMonths) {
        throw new BadRequestException('Min duration cannot exceed max duration');
      }

      const existing = await this.prisma.stakingTier.findUnique({
        where: { tierId },
      });

      if (existing) {
        throw new BadRequestException(`Tier ${tierId} already exists`);
      }

      const tier = await this.prisma.stakingTier.create({
        data: {
          id: uuidv4(),
          tierId,
          multiplier: BigInt(multiplier),
          minMonths,
          maxMonths,
          isActive,
        },
      });

      this.logger.log(`Staking tier created: ${tierId}`);

      return {
        id: tier.id,
        tierId: tier.tierId,
        multiplier: tier.multiplier.toString(),
        minMonths: tier.minMonths,
        maxMonths: tier.maxMonths,
        isActive: tier.isActive,
        message: 'Tier created successfully. Please create it on-chain as well.',
      };
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      const isExpectedError =
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException;

      if (!isTestMode || !isExpectedError) {
        this.logger.error(`Create tier error: ${error.message}`, error.stack);
      }
      throw error;
    }
  }

  async updateTier(
    wallet: string,
    tierId: number,
    updates: {
      multiplier?: number;
      minMonths?: number;
      maxMonths?: number;
      isActive?: boolean;
    },
  ) {
    this.checkAdminAccess(wallet);

    try {
      const tier = await this.prisma.stakingTier.findUnique({
        where: { tierId },
      });

      if (!tier) {
        throw new NotFoundException(`Tier ${tierId} not found`);
      }

      const updatedTier = await this.prisma.stakingTier.update({
        where: { tierId },
        data: {
          multiplier: updates.multiplier ? BigInt(updates.multiplier) : undefined,
          minMonths: updates.minMonths,
          maxMonths: updates.maxMonths,
          isActive: updates.isActive,
        },
      });

      this.logger.log(`Staking tier updated: ${tierId}`);

      return {
        id: updatedTier.id,
        tierId: updatedTier.tierId,
        multiplier: updatedTier.multiplier.toString(),
        minMonths: updatedTier.minMonths,
        maxMonths: updatedTier.maxMonths,
        isActive: updatedTier.isActive,
        message: 'Tier updated successfully',
      };
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      const isExpectedError =
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException;

      if (!isTestMode || !isExpectedError) {
        this.logger.error(`Update tier error: ${error.message}`, error.stack);
      }
      throw error;
    }
  }

  async getTiers(isActive?: boolean) {
    try {
      const where: any = {};

      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      const tiers = await this.prisma.stakingTier.findMany({
        where,
        orderBy: {
          tierId: 'asc',
        },
      });

      return tiers.map((tier) => ({
        id: tier.id,
        tierId: tier.tierId,
        multiplier: tier.multiplier.toString(),
        minMonths: tier.minMonths,
        maxMonths: tier.maxMonths,
        isActive: tier.isActive,
        createdAt: tier.createdAt,
        updatedAt: tier.updatedAt,
      }));
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      const isExpectedError =
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException;

      if (!isTestMode || !isExpectedError) {
        this.logger.error(`Get tiers error: ${error.message}`, error.stack);
      }
      throw error;
    }
  }

  async pauseProgram(wallet: string) {
    this.checkAdminAccess(wallet);

    try {
      const programState = await this.prisma.programState.findFirst();

      if (!programState) {
        throw new BadRequestException('Program state not initialized');
      }

      if (programState.isPaused) {
        throw new BadRequestException('Program already paused');
      }

      await this.prisma.programState.update({
        where: { id: programState.id },
        data: { isPaused: true },
      });

      this.logger.log('Program paused');

      return {
        message: 'Program paused successfully. Please pause on-chain as well.',
        isPaused: true,
      };
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      const isExpectedError =
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException;

      if (!isTestMode || !isExpectedError) {
        this.logger.error(`Pause program error: ${error.message}`, error.stack);
      }
      throw error;
    }
  }

  async unpauseProgram(wallet: string) {
    this.checkAdminAccess(wallet);

    try {
      const programState = await this.prisma.programState.findFirst();

      if (!programState) {
        throw new BadRequestException('Program state not initialized');
      }

      if (!programState.isPaused) {
        throw new BadRequestException('Program is not paused');
      }

      await this.prisma.programState.update({
        where: { id: programState.id },
        data: { isPaused: false },
      });

      this.logger.log('Program unpaused');

      return {
        message: 'Program unpaused successfully. Please unpause on-chain as well.',
        isPaused: false,
      };
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      const isExpectedError =
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException;

      if (!isTestMode || !isExpectedError) {
        this.logger.error(`Unpause program error: ${error.message}`, error.stack);
      }
      throw error;
    }
  }

  async replenishRewardPool(wallet: string, amount: number) {
    this.checkAdminAccess(wallet);

    try {
      const programState = await this.prisma.programState.findFirst();

      if (!programState) {
        throw new BadRequestException('Program state not initialized');
      }

      const newPoolBalance = Number(programState.totalRewardPool) + amount;

      await this.prisma.programState.update({
        where: { id: programState.id },
        data: {
          totalRewardPool: BigInt(newPoolBalance),
        },
      });

      this.logger.log(`Reward pool replenished with ${amount}`);

      return {
        amountAdded: amount,
        newPoolBalance: newPoolBalance.toString(),
        message:
          'Reward pool replenished successfully. Please execute on-chain transaction as well.',
      };
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      const isExpectedError =
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException;

      if (!isTestMode || !isExpectedError) {
        this.logger.error(`Replenish pool error: ${error.message}`, error.stack);
      }
      throw error;
    }
  }

  async getProgramState() {
    try {
      const programState = await this.prisma.programState.findFirst();

      if (!programState) {
        return {
          message: 'Program state not initialized',
          initialized: false,
        };
      }

      return {
        id: programState.id,
        programId: programState.programId,
        rewardTokenMint: programState.rewardTokenMint,
        isPaused: programState.isPaused,
        currentEpoch: programState.currentEpoch.toString(),
        currentEpochStartTs: programState.currentEpochStartTs?.toString() || null,
        currentWeeklyEmission: programState.currentWeeklyEmission?.toString() || null,
        totalStaked: programState.totalStaked.toString(),
        totalRewardPool: programState.totalRewardPool.toString(),
        totalStakingPower: programState.totalStakingPower.toString(),
        updatedAt: programState.updatedAt,
        initialized: true,
      };
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      const isExpectedError =
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException;

      if (!isTestMode || !isExpectedError) {
        this.logger.error(`Get program state error: ${error.message}`, error.stack);
      }
      throw error;
    }
  }

  async recordRevenueReplenishment(
    wallet: string,
    source: string,
    amount: number,
    transactionHash?: string,
  ) {
    this.checkAdminAccess(wallet);

    try {
      // Calculate allocation: 5% to reward pool, 5% to cashback pool (split 2%/3%)
      const toRewardPool = Math.floor((amount * 5) / 100);
      const toCashbackPerpetual = Math.floor((amount * 2) / 100);
      const toCashbackBonus = Math.floor((amount * 3) / 100);
      const totalCashback = toCashbackPerpetual + toCashbackBonus;

      // Create revenue transaction record with proofs
      await this.prisma.revenueTransaction.create({
        data: {
          source,
          amount: BigInt(amount),
          toRewardPool: BigInt(toRewardPool),
          toCashbackPool: BigInt(totalCashback),
          transactionHash: transactionHash || null,
        },
      });

      // Update reward pool
      const programState = await this.prisma.programState.findFirst();
      if (programState) {
        await this.prisma.programState.update({
          where: { id: programState.id },
          data: {
            totalRewardPool: { increment: BigInt(toRewardPool) },
          },
        });
      }

      // Update cashback pools
      const perpetualPool = await this.prisma.cashbackPool.findFirst({
        where: { poolType: 'PERPETUAL' },
      });

      const bonusPool = await this.prisma.cashbackPool.findFirst({
        where: { poolType: 'BONUS' },
      });

      if (perpetualPool && bonusPool) {
        await this.prisma.cashbackPool.update({
          where: { id: perpetualPool.id },
          data: {
            balance: { increment: BigInt(toCashbackPerpetual) },
            lastFundedAt: new Date(),
          },
        });

        await this.prisma.cashbackPool.update({
          where: { id: bonusPool.id },
          data: {
            balance: { increment: BigInt(toCashbackBonus) },
            lastFundedAt: new Date(),
          },
        });
      }

      this.logger.log(
        `Revenue replenishment recorded: ${amount} (Reward pool: ${toRewardPool}, Cashback: ${totalCashback})`,
      );

      return {
        source,
        totalAmount: amount,
        toRewardPool,
        toCashbackPerpetual,
        toCashbackBonus,
        transactionHash: transactionHash || null,
        message: 'Revenue replenishment recorded with transaction proofs',
      };
    } catch (error) {
      const isTestMode = process.env.NODE_ENV === 'test';
      const isExpectedError =
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ForbiddenException;

      if (!isTestMode || !isExpectedError) {
        this.logger.error(`Record revenue error: ${error.message}`, error.stack);
      }
      throw error;
    }
  }

  async getRevenueHistory(limit: number = 50) {
    try {
      const transactions = await this.prisma.revenueTransaction.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      const totalRevenue = transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
      const totalToRewardPool = transactions.reduce(
        (sum, tx) => sum + Number(tx.toRewardPool || 0),
        0,
      );
      const totalToCashback = transactions.reduce(
        (sum, tx) => sum + Number(tx.toCashbackPool || 0),
        0,
      );

      return {
        totalRevenue: totalRevenue.toString(),
        totalToRewardPool: totalToRewardPool.toString(),
        totalToCashback: totalToCashback.toString(),
        transactionCount: transactions.length,
        transactions: transactions.map((tx) => ({
          source: tx.source,
          amount: tx.amount.toString(),
          toRewardPool: tx.toRewardPool?.toString() || '0',
          toCashbackPool: tx.toCashbackPool?.toString() || '0',
          transactionHash: tx.transactionHash,
          createdAt: tx.createdAt,
        })),
      };
    } catch (error) {
      this.logger.error(`Get revenue history error: ${error.message}`, error.stack);
      throw error;
    }
  }
}
