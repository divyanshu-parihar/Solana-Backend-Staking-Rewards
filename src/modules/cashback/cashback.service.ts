import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CashbackService {
  private readonly logger = new Logger(CashbackService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async initializePools() {
    try {
      // Check if pools already exist
      const existing = await this.prisma.cashbackPool.findMany();

      if (existing.length === 0) {
        // Create perpetual and bonus pools
        await this.prisma.cashbackPool.createMany({
          data: [
            {
              id: uuidv4(),
              poolType: 'PERPETUAL',
              balance: BigInt(0),
            },
            {
              id: uuidv4(),
              poolType: 'BONUS',
              balance: BigInt(0),
            },
          ],
        });

        this.logger.log('Cashback pools initialized: PERPETUAL and BONUS');
      }

      return await this.getPoolsStatus();
    } catch (error) {
      this.logger.error(`Initialize pools error: ${error.message}`, error.stack);
      throw error;
    }
  }

  async fundPools(perpetualAmount: number, bonusAmount: number) {
    try {
      // Fund perpetual pool (2%)
      const perpetualPool = await this.prisma.cashbackPool.findFirst({
        where: { poolType: 'PERPETUAL' },
      });

      if (!perpetualPool) {
        throw new BadRequestException('Perpetual pool not found');
      }

      await this.prisma.cashbackPool.update({
        where: { id: perpetualPool.id },
        data: {
          balance: { increment: BigInt(perpetualAmount) },
          lastFundedAt: new Date(),
        },
      });

      // Fund bonus pool (3%)
      const bonusPool = await this.prisma.cashbackPool.findFirst({
        where: { poolType: 'BONUS' },
      });

      if (!bonusPool) {
        throw new BadRequestException('Bonus pool not found');
      }

      await this.prisma.cashbackPool.update({
        where: { id: bonusPool.id },
        data: {
          balance: { increment: BigInt(bonusAmount) },
          lastFundedAt: new Date(),
        },
      });

      this.logger.log(
        `Cashback pools funded: PERPETUAL +${perpetualAmount}, BONUS +${bonusAmount}`,
      );

      return {
        perpetualFunded: perpetualAmount,
        bonusFunded: bonusAmount,
        message: 'Cashback pools funded successfully',
      };
    } catch (error) {
      this.logger.error(`Fund pools error: ${error.message}`, error.stack);
      throw error;
    }
  }

  async distributeCashback(wallet: string, tradingVolume: number, userId: string) {
    try {
      // Get 30-day staking average to determine eligibility
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const snapshots = await this.prisma.stakingSnapshot.findMany({
        where: {
          wallet,
          snapshotDate: { gte: thirtyDaysAgo },
        },
        orderBy: { snapshotDate: 'desc' },
      });

      if (snapshots.length === 0) {
        return {
          wallet,
          cashbackAmount: 0,
          message: 'No staking history for cashback eligibility',
        };
      }

      // Calculate 30-day average
      const totalStaked = snapshots.reduce((sum, s) => sum + Number(s.totalStaked), 0);
      const averageStaked = Math.floor(totalStaked / snapshots.length);

      // Calculate cashback percentage based on average stake
      const cashbackPercentage = this.calculateCashbackPercentage(averageStaked);
      const cashbackAmount = Math.floor((tradingVolume * cashbackPercentage) / 10000);

      if (cashbackAmount === 0) {
        return {
          wallet,
          cashbackAmount: 0,
          averageStaked,
          cashbackPercentage: cashbackPercentage / 100,
          message: 'Cashback amount too small',
        };
      }

      // Try to pay from bonus pool first, then perpetual
      let paidFromBonus = 0;
      let paidFromPerpetual = 0;

      const bonusPool = await this.prisma.cashbackPool.findFirst({
        where: { poolType: 'BONUS' },
      });

      const perpetualPool = await this.prisma.cashbackPool.findFirst({
        where: { poolType: 'PERPETUAL' },
      });

      if (!bonusPool || !perpetualPool) {
        throw new BadRequestException('Cashback pools not initialized');
      }

      const bonusBalance = Number(bonusPool.balance);
      const perpetualBalance = Number(perpetualPool.balance);

      // Pay from bonus pool first
      if (bonusBalance > 0) {
        paidFromBonus = Math.min(cashbackAmount, bonusBalance);

        await this.prisma.cashbackPool.update({
          where: { id: bonusPool.id },
          data: { balance: { decrement: BigInt(paidFromBonus) } },
        });

        await this.prisma.cashbackTransaction.create({
          data: {
            id: uuidv4(),
            userId,
            wallet,
            amount: BigInt(paidFromBonus),
            poolType: 'BONUS',
            transactionType: 'DEBIT',
            metadata: { tradingVolume, cashbackPercentage, averageStaked },
          },
        });
      }

      // If bonus pool is depleted, pay remaining from perpetual
      const remaining = cashbackAmount - paidFromBonus;
      if (remaining > 0 && perpetualBalance > 0) {
        paidFromPerpetual = Math.min(remaining, perpetualBalance);

        await this.prisma.cashbackPool.update({
          where: { id: perpetualPool.id },
          data: { balance: { decrement: BigInt(paidFromPerpetual) } },
        });

        await this.prisma.cashbackTransaction.create({
          data: {
            id: uuidv4(),
            userId,
            wallet,
            amount: BigInt(paidFromPerpetual),
            poolType: 'PERPETUAL',
            transactionType: 'DEBIT',
            metadata: { tradingVolume, cashbackPercentage, averageStaked },
          },
        });
      }

      const totalPaid = paidFromBonus + paidFromPerpetual;

      this.logger.log(
        `Cashback distributed to ${wallet}: ${totalPaid} (Bonus: ${paidFromBonus}, Perpetual: ${paidFromPerpetual})`,
      );

      return {
        wallet,
        cashbackAmount: totalPaid,
        paidFromBonus,
        paidFromPerpetual,
        averageStaked,
        cashbackPercentage: cashbackPercentage / 100,
        tradingVolume,
        message: 'Cashback distributed successfully',
      };
    } catch (error) {
      this.logger.error(`Distribute cashback error: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getUserCashbackHistory(wallet: string) {
    try {
      const transactions = await this.prisma.cashbackTransaction.findMany({
        where: { wallet, transactionType: 'DEBIT' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      const totalCashback = transactions.reduce((sum, tx) => sum + Number(tx.amount), 0);

      return {
        wallet,
        totalCashback: totalCashback.toString(),
        transactionCount: transactions.length,
        transactions: transactions.map((tx) => ({
          amount: tx.amount.toString(),
          poolType: tx.poolType,
          createdAt: tx.createdAt,
          metadata: tx.metadata,
        })),
      };
    } catch (error) {
      this.logger.error(`Get cashback history error: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getPoolsStatus() {
    try {
      const pools = await this.prisma.cashbackPool.findMany();

      return {
        pools: pools.map((pool) => ({
          poolType: pool.poolType,
          balance: pool.balance.toString(),
          lastFundedAt: pool.lastFundedAt,
          isEmpty: Number(pool.balance) === 0,
        })),
      };
    } catch (error) {
      this.logger.error(`Get pools status error: ${error.message}`, error.stack);
      throw error;
    }
  }

  private calculateCashbackPercentage(averageStaked: number): number {
    // Return basis points (10000 = 100%)
    // Example tiers (adjust as needed):
    // < 1,000 tokens: 0.5%
    // 1,000 - 10,000 tokens: 1%
    // 10,000 - 100,000 tokens: 1.5%
    // > 100,000 tokens: 2%

    if (averageStaked < 1000000000) return 50; // 0.5%
    if (averageStaked < 10000000000) return 100; // 1%
    if (averageStaked < 100000000000) return 150; // 1.5%
    return 200; // 2%
  }
}
