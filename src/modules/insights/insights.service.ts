import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@prisma/prisma.service';
import { ProgramService } from '@modules/program/program.service';

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private prisma: PrismaService,
    private programService: ProgramService,
    private configService: ConfigService,
  ) {}

  async getCurrentEpoch() {
    try {
      const programState = await this.prisma.programState.findFirst();

      if (!programState) {
        return {
          initialized: false,
          message: 'Program state not initialized',
        };
      }

      const weeklyEmissionRate = this.configService.get<number>('staking.weeklyEmissionRate') || 21;
      const emissionPrecision =
        this.configService.get<number>('staking.emissionPrecision') || 10000;

      const totalRewardPool = Number(programState.totalRewardPool);
      const weeklyPoolEmission = Math.floor(
        (totalRewardPool * weeklyEmissionRate) / emissionPrecision,
      );

      return {
        epoch: programState.currentEpoch.toString(),
        epochStartTs: programState.currentEpochStartTs?.toString() || null,
        pool: programState.totalRewardPool.toString(),
        totalStaked: programState.totalStaked.toString(),
        totalStakingPower: programState.totalStakingPower.toString(),
        weeklyEmission: weeklyPoolEmission,
        weeklyEmissionRate: `${weeklyEmissionRate / 100}%`,
        isPaused: programState.isPaused,
        currentWeeklyEmission: programState.currentWeeklyEmission?.toString() || null,
        updatedAt: programState.updatedAt,
      };
    } catch (error) {
      this.logger.error(`Error getting current epoch: ${error.message}`);
      throw error;
    }
  }

  async getStakingPower(owner: string) {
    try {
      const positions = await this.prisma.stakePosition.findMany({
        where: {
          owner,
          isActive: true,
        },
        include: {
          tier: true,
        },
        orderBy: {
          stakingPower: 'desc',
        },
      });

      if (positions.length === 0) {
        return {
          owner,
          totalStakingPower: '0',
          totalStaked: '0',
          positions: [],
        };
      }

      const totalStakingPower = positions.reduce((sum, p) => sum + Number(p.stakingPower), 0);

      const totalStaked = positions.reduce((sum, p) => sum + Number(p.amount), 0);

      const programState = await this.prisma.programState.findFirst();
      const globalStakingPower = Number(programState?.totalStakingPower || 0);

      const shareOfPool =
        globalStakingPower > 0 ? (totalStakingPower / globalStakingPower) * 100 : 0;

      return {
        owner,
        totalStakingPower: totalStakingPower.toString(),
        totalStaked: totalStaked.toString(),
        shareOfPool: `${shareOfPool.toFixed(4)}%`,
        positionCount: positions.length,
        positions: positions.map((p) => ({
          pda: p.pda,
          amount: p.amount.toString(),
          stakingPower: p.stakingPower.toString(),
          powerMultiplier: p.powerMultiplier.toString(),
          durationMonths: p.durationMonths,
          tierId: p.tierId,
          tierMultiplier: p.tier.multiplier.toString(),
          isLocked: p.isLocked,
          startTs: p.startTs.toString(),
          unlockTs: p.unlockTs.toString(),
        })),
      };
    } catch (error) {
      this.logger.error(`Error getting staking power for ${owner}: ${error.message}`);
      throw error;
    }
  }

  async getRewardPreview(owner: string) {
    try {
      const positions = await this.prisma.stakePosition.findMany({
        where: {
          owner,
          isActive: true,
        },
      });

      if (positions.length === 0) {
        return {
          owner,
          estimatedRewards: '0',
          positions: [],
        };
      }

      const programState = await this.prisma.programState.findFirst();

      if (!programState) {
        return {
          owner,
          estimatedRewards: '0',
          message: 'Program state not initialized',
          positions: [],
        };
      }

      const now = Math.floor(Date.now() / 1000);
      const weekInSeconds = 7 * 24 * 60 * 60;
      const totalStakingPower = Number(programState.totalStakingPower);
      const rewardPool = Number(programState.totalRewardPool);

      const weeklyEmissionRate = 21;
      const emissionPrecision = 10000;
      const weeklyPoolEmission = Math.floor((rewardPool * weeklyEmissionRate) / emissionPrecision);

      const positionPreviews = positions.map((position) => {
        const stakingPower = Number(position.stakingPower);
        const lastRewardTs = Number(position.lastRewardTs);
        const timeElapsed = now - lastRewardTs;
        const weeksElapsed = Math.floor(timeElapsed / weekInSeconds);

        const userWeeklyShare =
          totalStakingPower > 0
            ? Math.floor((weeklyPoolEmission * stakingPower) / totalStakingPower)
            : 0;

        const estimatedReward = userWeeklyShare * Math.max(weeksElapsed, 0);

        const lastClaim = position.lastClaimTs
          ? Number(position.lastClaimTs)
          : Number(position.startTs);
        const canClaimAt = lastClaim + weekInSeconds;
        const canClaim = now >= canClaimAt;

        return {
          pda: position.pda,
          stakingPower: stakingPower.toString(),
          weeklyShare: userWeeklyShare.toString(),
          weeksElapsed,
          estimatedReward: estimatedReward.toString(),
          lastRewardTs: position.lastRewardTs.toString(),
          canClaim,
          canClaimAt: canClaimAt,
          nextClaimIn: canClaim ? 0 : canClaimAt - now,
        };
      });

      const totalEstimatedRewards = positionPreviews.reduce(
        (sum, p) => sum + Number(p.estimatedReward),
        0,
      );

      return {
        owner,
        estimatedRewards: totalEstimatedRewards.toString(),
        weeklyPoolEmission: weeklyPoolEmission.toString(),
        positions: positionPreviews,
      };
    } catch (error) {
      this.logger.error(`Error getting reward preview for ${owner}: ${error.message}`);
      throw error;
    }
  }

  async getProtocolStats() {
    try {
      const programState = await this.prisma.programState.findFirst();

      const [totalUsers, activePositions, totalPositions, activeNfts, totalEvents] =
        await Promise.all([
          this.prisma.user.count(),
          this.prisma.stakePosition.count({ where: { isActive: true } }),
          this.prisma.stakePosition.count(),
          this.prisma.rewardNft.count({ where: { isActive: true } }),
          this.prisma.event.count(),
        ]);

      const tierStats = await this.prisma.stakePosition.groupBy({
        by: ['tierId'],
        where: { isActive: true },
        _count: true,
        _sum: {
          amount: true,
          stakingPower: true,
        },
      });

      return {
        protocol: {
          totalStaked: programState?.totalStaked.toString() || '0',
          totalRewardPool: programState?.totalRewardPool.toString() || '0',
          totalStakingPower: programState?.totalStakingPower.toString() || '0',
          currentEpoch: programState?.currentEpoch.toString() || '0',
          isPaused: programState?.isPaused || false,
        },
        users: {
          total: totalUsers,
        },
        positions: {
          active: activePositions,
          total: totalPositions,
          byTier: tierStats.map((t) => ({
            tierId: t.tierId,
            count: t._count,
            totalStaked: t._sum.amount?.toString() || '0',
            totalStakingPower: t._sum.stakingPower?.toString() || '0',
          })),
        },
        nfts: {
          active: activeNfts,
        },
        events: {
          total: totalEvents,
        },
      };
    } catch (error) {
      this.logger.error(`Error getting protocol stats: ${error.message}`);
      throw error;
    }
  }

  async getLeaderboard(limit: number = 10) {
    try {
      const topStakers = await this.prisma.stakePosition.groupBy({
        by: ['owner'],
        where: { isActive: true },
        _sum: {
          stakingPower: true,
          amount: true,
        },
        _count: true,
        orderBy: {
          _sum: {
            stakingPower: 'desc',
          },
        },
        take: limit,
      });

      return {
        leaderboard: topStakers.map((entry, index) => ({
          rank: index + 1,
          owner: entry.owner,
          totalStakingPower: entry._sum.stakingPower?.toString() || '0',
          totalStaked: entry._sum.amount?.toString() || '0',
          positionCount: entry._count,
        })),
      };
    } catch (error) {
      this.logger.error(`Error getting leaderboard: ${error.message}`);
      throw error;
    }
  }
}
