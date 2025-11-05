import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DiscountService {
  private readonly logger = new Logger(DiscountService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  // Run daily at 00:00 UTC to create snapshots
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, { name: 'daily-staking-snapshot' })
  async createDailySnapshots() {
    try {
      this.logger.log('Creating daily staking snapshots for all users');

      // Get all active stake positions grouped by user
      const positions = await this.prisma.stakePosition.groupBy({
        by: ['owner'],
        where: { isActive: true },
        _sum: {
          amount: true,
        },
      });

      const snapshots = [];
      for (const position of positions) {
        const user = await this.prisma.user.findUnique({
          where: { wallet: position.owner },
        });

        if (user) {
          snapshots.push({
            id: uuidv4(),
            userId: user.id,
            wallet: position.owner,
            totalStaked: position._sum.amount || BigInt(0),
            snapshotDate: new Date(),
          });
        }
      }

      if (snapshots.length > 0) {
        await this.prisma.stakingSnapshot.createMany({
          data: snapshots,
        });

        this.logger.log(`Created ${snapshots.length} daily staking snapshots`);
      }

      // Clean up snapshots older than 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      await this.prisma.stakingSnapshot.deleteMany({
        where: {
          snapshotDate: { lt: ninetyDaysAgo },
        },
      });

      return {
        snapshotsCreated: snapshots.length,
        message: 'Daily staking snapshots created successfully',
      };
    } catch (error) {
      this.logger.error(`Create daily snapshots error: ${error.message}`, error.stack);
      throw error;
    }
  }

  async calculate30DayAverage(wallet: string): Promise<number> {
    try {
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
        return 0;
      }

      const totalStaked = snapshots.reduce((sum, snapshot) => {
        return sum + Number(snapshot.totalStaked);
      }, 0);

      const average = Math.floor(totalStaked / snapshots.length);

      return average;
    } catch (error) {
      this.logger.error(
        `Calculate 30-day average error for ${wallet}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getFeeDiscount(wallet: string) {
    try {
      const average30Day = await this.calculate30DayAverage(wallet);

      const discountPercentage = this.calculateDiscountPercentage(average30Day);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const snapshotCount = await this.prisma.stakingSnapshot.count({
        where: {
          wallet,
          snapshotDate: { gte: thirtyDaysAgo },
        },
      });

      return {
        wallet,
        average30DayStake: average30Day.toString(),
        feeDiscountPercentage: discountPercentage,
        snapshotsUsed: snapshotCount,
        message: `${discountPercentage}% fee discount based on 30-day average stake`,
      };
    } catch (error) {
      this.logger.error(`Get fee discount error for ${wallet}: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getUserStakingHistory(wallet: string, days: number = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const snapshots = await this.prisma.stakingSnapshot.findMany({
        where: {
          wallet,
          snapshotDate: { gte: startDate },
        },
        orderBy: { snapshotDate: 'asc' },
      });

      const average = snapshots.length > 0
        ? Math.floor(
            snapshots.reduce((sum, s) => sum + Number(s.totalStaked), 0) / snapshots.length,
          )
        : 0;

      return {
        wallet,
        days,
        snapshotCount: snapshots.length,
        average: average.toString(),
        snapshots: snapshots.map((s) => ({
          date: s.snapshotDate,
          totalStaked: s.totalStaked.toString(),
        })),
      };
    } catch (error) {
      this.logger.error(
        `Get staking history error for ${wallet}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private calculateDiscountPercentage(average30Day: number): number {
    // Fee discount tiers based on 30-day average stake
    // Example tiers (adjust as needed):
    // < 1,000 tokens: 0%
    // 1,000 - 10,000 tokens: 5%
    // 10,000 - 50,000 tokens: 10%
    // 50,000 - 100,000 tokens: 15%
    // > 100,000 tokens: 20%

    if (average30Day < 1000000000) return 0; // 0%
    if (average30Day < 10000000000) return 5; // 5%
    if (average30Day < 50000000000) return 10; // 10%
    if (average30Day < 100000000000) return 15; // 15%
    return 20; // 20% max discount
  }
}
