import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '@prisma/prisma.service';
import { ProgramService } from '@modules/program/program.service';

@Processor('reward-distribution')
export class RewardDistributionProcessor {
  private readonly logger = new Logger(RewardDistributionProcessor.name);

  constructor(
    private prisma: PrismaService,
    private programService: ProgramService,
  ) {}

  @Process('distribute-weekly')
  async handleWeeklyDistribution(job: Job) {
    this.logger.log(`Processing weekly reward distribution job ${job.id}`);

    try {
      const programState = await this.prisma.programState.findFirst();

      if (!programState) {
        throw new Error('Program state not initialized');
      }

      if (programState.isPaused) {
        this.logger.warn('Program is paused, skipping reward distribution');
        return { skipped: true, reason: 'Program paused' };
      }

      // Get all active stake positions
      const activePositions = await this.prisma.stakePosition.findMany({
        where: { isActive: true },
        include: { user: true },
      });

      if (activePositions.length === 0) {
        this.logger.log('No active positions found');
        return { distributed: 0, amount: 0 };
      }

      const now = Math.floor(Date.now() / 1000);
      const totalStakingPower = Number(programState.totalStakingPower);
      const rewardPool = Number(programState.totalRewardPool);

      // Calculate weekly pool emission (0.21%)
      const weeklyEmissionRate = 21; // 0.21% = 21/10000
      const emissionPrecision = 10000;
      const weeklyPoolEmission = Math.floor((rewardPool * weeklyEmissionRate) / emissionPrecision);

      this.logger.log(
        `Weekly emission: ${weeklyPoolEmission}, Total staking power: ${totalStakingPower}`,
      );

      let distributedCount = 0;
      let totalDistributed = 0;

      // Update reward timestamps for all positions
      // In a real implementation, this would create on-chain distributions
      for (const position of activePositions) {
        const stakingPower = Number(position.stakingPower);
        const userShare = Math.floor((weeklyPoolEmission * stakingPower) / totalStakingPower);

        if (userShare > 0) {
          // Update last reward timestamp
          await this.prisma.stakePosition.update({
            where: { id: position.id },
            data: { lastRewardTs: BigInt(now) },
          });

          distributedCount++;
          totalDistributed += userShare;
        }
      }

      // Update program state
      const newEpoch = Number(programState.currentEpoch) + 1;
      await this.prisma.programState.update({
        where: { id: programState.id },
        data: {
          currentEpoch: BigInt(newEpoch),
          currentEpochStartTs: BigInt(now),
          currentWeeklyEmission: BigInt(weeklyPoolEmission),
        },
      });

      this.logger.log(
        `Weekly distribution complete: ${distributedCount} positions, ${totalDistributed} tokens`,
      );

      return {
        success: true,
        epoch: newEpoch,
        positionsUpdated: distributedCount,
        totalDistributed,
        weeklyEmission: weeklyPoolEmission,
      };
    } catch (error) {
      this.logger.error(`Weekly distribution failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
