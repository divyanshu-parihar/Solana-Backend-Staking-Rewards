import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '@prisma/prisma.service';
import { ProgramService } from '@modules/program/program.service';

@Processor('cooldown-finalizer')
export class CooldownFinalizerProcessor {
  private readonly logger = new Logger(CooldownFinalizerProcessor.name);

  constructor(
    private prisma: PrismaService,
    private programService: ProgramService,
  ) {}

  @Process('finalize-cooldowns')
  async handleCooldownFinalization(job: Job) {
    this.logger.log(`Processing cooldown finalizer job ${job.id}`);

    try {
      const now = Math.floor(Date.now() / 1000);

      // Find all positions with expired cooldowns
      const positionsToFinalize = await this.prisma.stakePosition.findMany({
        where: {
          isActive: true,
          cooldownEnd: {
            not: null,
            lte: BigInt(now),
          },
          pendingPrincipal: {
            not: null,
            gt: BigInt(0),
          },
        },
        include: { user: true },
      });

      if (positionsToFinalize.length === 0) {
        this.logger.debug('No cooldowns ready to finalize');
        return { finalized: 0 };
      }

      this.logger.log(`Found ${positionsToFinalize.length} positions ready to finalize`);

      let finalizedCount = 0;
      const results = [];

      for (const position of positionsToFinalize) {
        try {
          // In production, this would trigger an on-chain finalization
          // For now, we update the database state
          await this.prisma.stakePosition.update({
            where: { id: position.id },
            data: {
              isActive: false,
              pendingPrincipal: BigInt(0),
              cooldownEnd: null,
            },
          });

          // Update program state
          const programState = await this.prisma.programState.findFirst();
          if (programState) {
            const newTotalStaked = Number(programState.totalStaked) - Number(position.amount);
            const newTotalStakingPower =
              Number(programState.totalStakingPower) - Number(position.stakingPower);

            await this.prisma.programState.update({
              where: { id: programState.id },
              data: {
                totalStaked: BigInt(Math.max(0, newTotalStaked)),
                totalStakingPower: BigInt(Math.max(0, newTotalStakingPower)),
              },
            });
          }

          finalizedCount++;
          results.push({
            positionId: position.id,
            pda: position.pda,
            owner: position.owner,
            amount: position.pendingPrincipal?.toString() || '0',
            status: 'finalized',
          });

          this.logger.log(`Finalized position ${position.pda} for ${position.owner}`);
        } catch (error) {
          this.logger.error(`Failed to finalize position ${position.id}: ${error.message}`);
          results.push({
            positionId: position.id,
            pda: position.pda,
            owner: position.owner,
            status: 'failed',
            error: error.message,
          });
        }
      }

      return {
        success: true,
        finalized: finalizedCount,
        total: positionsToFinalize.length,
        results,
      };
    } catch (error) {
      this.logger.error(`Cooldown finalizer failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
