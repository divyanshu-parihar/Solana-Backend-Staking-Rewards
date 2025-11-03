import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class WorkerService {
  private readonly logger = new Logger(WorkerService.name);

  constructor(
    @InjectQueue('reward-distribution') private rewardQueue: Queue,
    @InjectQueue('cooldown-finalizer') private cooldownQueue: Queue,
    @InjectQueue('transaction-retry') private retryQueue: Queue,
    @InjectQueue('indexer-sync') private indexerQueue: Queue,
  ) {}

  // Weekly reward distribution - every Sunday at 00:00 UTC
  @Cron('0 0 * * 0', { name: 'weekly-reward-distribution' })
  async scheduleWeeklyRewardDistribution() {
    this.logger.log('Scheduling weekly reward distribution job');
    await this.rewardQueue.add('distribute-weekly', {
      timestamp: Date.now(),
    });
  }

  // Cooldown finalizer - runs every hour to check positions ready to finalize
  @Cron(CronExpression.EVERY_HOUR, { name: 'cooldown-finalizer' })
  async scheduleCooldownFinalizer() {
    this.logger.log('Scheduling cooldown finalizer job');
    await this.cooldownQueue.add('finalize-cooldowns', {
      timestamp: Date.now(),
    });
  }

  // Indexer sync - runs every 2 minutes
  @Cron('*/2 * * * *', { name: 'indexer-sync' })
  async scheduleIndexerSync() {
    this.logger.debug('Scheduling indexer sync job');
    await this.indexerQueue.add('sync-events', {
      timestamp: Date.now(),
    });
  }

  // Manual trigger for weekly distribution (admin use)
  async triggerWeeklyDistribution() {
    this.logger.log('Manually triggering weekly reward distribution');
    return await this.rewardQueue.add(
      'distribute-weekly',
      { timestamp: Date.now(), manual: true },
      { priority: 1 },
    );
  }

  // Add transaction to retry queue
  async addTransactionRetry(txData: {
    signature: string;
    instruction: string;
    wallet: string;
    payload: any;
    attempt: number;
  }) {
    this.logger.log(`Adding transaction to retry queue: ${txData.signature}`);
    return await this.retryQueue.add('retry-transaction', txData, {
      delay: Math.pow(2, txData.attempt) * 1000, // Exponential backoff
    });
  }

  // Get queue statistics
  async getQueueStats() {
    const [rewardStats, cooldownStats, retryStats, indexerStats] = await Promise.all([
      this.getQueueMetrics(this.rewardQueue),
      this.getQueueMetrics(this.cooldownQueue),
      this.getQueueMetrics(this.retryQueue),
      this.getQueueMetrics(this.indexerQueue),
    ]);

    return {
      rewardDistribution: rewardStats,
      cooldownFinalizer: cooldownStats,
      transactionRetry: retryStats,
      indexerSync: indexerStats,
    };
  }

  private async getQueueMetrics(queue: Queue) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }
}
