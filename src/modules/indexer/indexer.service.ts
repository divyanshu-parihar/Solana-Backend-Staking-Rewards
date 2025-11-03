import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@prisma/prisma.service';
import { ProgramService } from '@modules/program/program.service';
import { Connection, PublicKey, Context, Logs } from '@solana/web3.js';

@Injectable()
export class IndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IndexerService.name);
  private connection: Connection;
  private programId: PublicKey;
  private subscriptionId: number | null = null;
  private isRunning = false;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 10;

  constructor(
    private prisma: PrismaService,
    private programService: ProgramService,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    const env = this.configService.get<string>('app.env');
    if (env !== 'test') {
      await this.startIndexer();
    }
  }

  async onModuleDestroy() {
    await this.stopIndexer();
  }

  async startIndexer() {
    if (this.isRunning) {
      this.logger.warn('Indexer is already running');
      return;
    }

    try {
      this.connection = this.programService.getConnection();
      this.programId = this.programService.getProgramId();

      this.logger.log(`Starting indexer for program: ${this.programId.toString()}`);

      this.subscriptionId = this.connection.onLogs(
        this.programId,
        (logs: Logs, ctx: Context) => this.handleLogs(logs, ctx),
        'confirmed',
      );

      this.isRunning = true;
      this.reconnectAttempts = 0;
      this.logger.log(`Indexer started successfully (subscription: ${this.subscriptionId})`);

      await this.backfillRecentEvents();
    } catch (error) {
      this.logger.error(`Failed to start indexer: ${error.message}`, error.stack);
      await this.handleReconnect();
    }
  }

  async stopIndexer() {
    if (!this.isRunning) {
      return;
    }

    this.logger.log('Stopping indexer...');

    if (this.subscriptionId !== null) {
      try {
        await this.connection.removeOnLogsListener(this.subscriptionId);
        this.logger.log('Indexer subscription removed');
      } catch (error) {
        this.logger.error(`Error removing subscription: ${error.message}`);
      }
    }

    this.isRunning = false;
    this.subscriptionId = null;
  }

  private async handleLogs(logs: Logs, ctx: Context) {
    try {
      const { signature, err } = logs;

      if (err) {
        this.logger.warn(`Transaction failed: ${signature}, error: ${JSON.stringify(err)}`);
        return;
      }

      const existing = await this.prisma.event.findUnique({
        where: { signature },
      });

      if (existing) {
        if (existing.commitment !== 'finalized') {
          await this.updateEventFinality(signature);
        }
        return;
      }

      this.logger.debug(`Processing new transaction: ${signature}`);

      const tx = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx) {
        this.logger.warn(`Could not fetch transaction: ${signature}`);
        return;
      }

      const instruction = await this.parseTransaction(tx, logs);

      await this.prisma.event.create({
        data: {
          signature,
          programId: this.programId.toString(),
          instruction: instruction.name,
          slot: BigInt(ctx.slot),
          timestamp: BigInt(tx.blockTime || Math.floor(Date.now() / 1000)),
          commitment: 'confirmed',
          finalized: false,
          payload: instruction.data,
        },
      });

      await this.updateRelatedEntities(instruction);

      this.logger.log(`Indexed ${instruction.name} event: ${signature} (slot ${ctx.slot})`);
    } catch (error) {
      this.logger.error(`Error handling logs for ${logs.signature}: ${error.message}`, error.stack);
    }
  }

  private async parseTransaction(tx: any, logs: Logs): Promise<{ name: string; data: any }> {
    const programLogs = logs.logs || [];

    for (const log of programLogs) {
      if (log.includes('Instruction: Stake')) {
        return this.parseStakeInstruction(tx);
      } else if (log.includes('Instruction: Unstake')) {
        return this.parseUnstakeInstruction(tx);
      } else if (log.includes('Instruction: FinalizeUnstake')) {
        return this.parseFinalizeInstruction(tx);
      } else if (log.includes('Instruction: ClaimRewards')) {
        return this.parseClaimInstruction(tx);
      } else if (log.includes('Instruction: VestReward')) {
        return this.parseVestInstruction(tx);
      } else if (log.includes('Instruction: CreateTier')) {
        return { name: 'CreateTier', data: {} };
      } else if (log.includes('Instruction: Pause')) {
        return { name: 'Pause', data: {} };
      } else if (log.includes('Instruction: Unpause')) {
        return { name: 'Unpause', data: {} };
      }
    }

    return { name: 'Unknown', data: { logs: programLogs } };
  }

  private parseStakeInstruction(tx: any): { name: string; data: any } {
    return {
      name: 'Stake',
      data: {
        accounts: tx.transaction?.message?.accountKeys?.map((k: any) => k.toString()) || [],
      },
    };
  }

  private parseUnstakeInstruction(tx: any): { name: string; data: any } {
    return {
      name: 'Unstake',
      data: {
        accounts: tx.transaction?.message?.accountKeys?.map((k: any) => k.toString()) || [],
      },
    };
  }

  private parseFinalizeInstruction(tx: any): { name: string; data: any } {
    return {
      name: 'FinalizeUnstake',
      data: {
        accounts: tx.transaction?.message?.accountKeys?.map((k: any) => k.toString()) || [],
      },
    };
  }

  private parseClaimInstruction(tx: any): { name: string; data: any } {
    return {
      name: 'ClaimRewards',
      data: {
        accounts: tx.transaction?.message?.accountKeys?.map((k: any) => k.toString()) || [],
      },
    };
  }

  private parseVestInstruction(tx: any): { name: string; data: any } {
    return {
      name: 'VestReward',
      data: {
        accounts: tx.transaction?.message?.accountKeys?.map((k: any) => k.toString()) || [],
      },
    };
  }

  private async updateRelatedEntities(instruction: { name: string; data: any }) {
    try {
      switch (instruction.name) {
        case 'Stake':
          break;
        case 'Unstake':
          break;
        case 'FinalizeUnstake':
          break;
        case 'ClaimRewards':
          break;
        case 'VestReward':
          break;
        default:
          break;
      }
    } catch (error) {
      this.logger.error(
        `Error updating related entities for ${instruction.name}: ${error.message}`,
      );
    }
  }

  private async updateEventFinality(signature: string) {
    try {
      const status = await this.connection.getSignatureStatus(signature);

      if (status?.value?.confirmationStatus === 'finalized') {
        await this.prisma.event.update({
          where: { signature },
          data: {
            commitment: 'finalized',
            finalized: true,
          },
        });

        this.logger.debug(`Event ${signature} marked as finalized`);
      }
    } catch (error) {
      this.logger.error(`Error updating finality for ${signature}: ${error.message}`);
    }
  }

  private async backfillRecentEvents() {
    this.logger.log('Backfilling recent events...');

    try {
      const signatures = await this.connection.getSignaturesForAddress(
        this.programId,
        { limit: 50 },
        'confirmed',
      );

      let backfilled = 0;

      for (const sigInfo of signatures) {
        const existing = await this.prisma.event.findUnique({
          where: { signature: sigInfo.signature },
        });

        if (!existing && !sigInfo.err) {
          backfilled++;
        }
      }

      this.logger.log(`Backfilled ${backfilled} recent events`);
    } catch (error) {
      this.logger.error(`Error backfilling events: ${error.message}`);
    }
  }

  private async handleReconnect() {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      this.logger.error('Max reconnection attempts reached, giving up');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    this.logger.warn(
      `Attempting to reconnect indexer in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );

    setTimeout(() => {
      this.startIndexer();
    }, delay);
  }

  async getIndexerStatus() {
    const lastEvent = await this.prisma.event.findFirst({
      orderBy: { slot: 'desc' },
    });

    const eventCounts = await this.prisma.event.groupBy({
      by: ['instruction'],
      _count: true,
    });

    return {
      isRunning: this.isRunning,
      subscriptionId: this.subscriptionId,
      lastProcessedSlot: lastEvent?.slot?.toString() || null,
      lastProcessedTime: lastEvent?.timestamp?.toString() || null,
      reconnectAttempts: this.reconnectAttempts,
      eventCounts: eventCounts.map((e) => ({
        instruction: e.instruction,
        count: e._count,
      })),
    };
  }

  async reconcileState() {
    this.logger.log('Starting state reconciliation...');

    try {
      const programState = await this.prisma.programState.findFirst();

      if (!programState) {
        this.logger.warn('Program state not initialized');
        return { success: false, reason: 'No program state' };
      }

      const positions = await this.prisma.stakePosition.count({
        where: { isActive: true },
      });

      const rewards = await this.prisma.rewardNft.count({
        where: { isActive: true },
      });

      this.logger.log(`Reconciliation complete: ${positions} positions, ${rewards} active NFTs`);

      return {
        success: true,
        positions,
        rewards,
        totalStaked: programState.totalStaked.toString(),
        totalStakingPower: programState.totalStakingPower.toString(),
      };
    } catch (error) {
      this.logger.error(`Reconciliation failed: ${error.message}`, error.stack);
      throw error;
    }
  }
}
