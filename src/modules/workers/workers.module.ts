import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '@prisma/prisma.module';
import { ProgramModule } from '@modules/program/program.module';
import { WorkerService } from './worker.service';
import { RewardDistributionProcessor } from './processors/reward-distribution.processor';
import { CooldownFinalizerProcessor } from './processors/cooldown-finalizer.processor';
import { TransactionRetryProcessor } from './processors/transaction-retry.processor';
import { IndexerSyncProcessor } from './processors/indexer-sync.processor';
import { WorkerController } from './worker.controller';

export const QUEUE_NAMES = {
  REWARD_DISTRIBUTION: 'reward-distribution',
  COOLDOWN_FINALIZER: 'cooldown-finalizer',
  TRANSACTION_RETRY: 'transaction-retry',
  INDEXER_SYNC: 'indexer-sync',
};

@Module({
  imports: [
    BullModule.registerQueue(
      { name: QUEUE_NAMES.REWARD_DISTRIBUTION },
      { name: QUEUE_NAMES.COOLDOWN_FINALIZER },
      { name: QUEUE_NAMES.TRANSACTION_RETRY },
      { name: QUEUE_NAMES.INDEXER_SYNC },
    ),
    PrismaModule,
    ProgramModule,
  ],
  controllers: [WorkerController],
  providers: [
    WorkerService,
    RewardDistributionProcessor,
    CooldownFinalizerProcessor,
    TransactionRetryProcessor,
    IndexerSyncProcessor,
  ],
  exports: [WorkerService],
})
export class WorkersModule {}
