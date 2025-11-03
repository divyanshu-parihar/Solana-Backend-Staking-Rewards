import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '@prisma/prisma.service';
import { ProgramService } from '@modules/program/program.service';

@Processor('indexer-sync')
export class IndexerSyncProcessor {
  private readonly logger = new Logger(IndexerSyncProcessor.name);
  private lastProcessedSlot: number = 0;

  constructor(
    private prisma: PrismaService,
    private programService: ProgramService,
  ) {}

  async onModuleInit() {
    // Load last processed slot from database
    const lastEvent = await this.prisma.event.findFirst({
      orderBy: { slot: 'desc' },
    });

    if (lastEvent) {
      this.lastProcessedSlot = Number(lastEvent.slot);
      this.logger.log(`Resuming from slot ${this.lastProcessedSlot}`);
    }
  }

  @Process('sync-events')
  async handleIndexerSync(job: Job) {
    this.logger.debug(`Processing indexer sync job ${job.id}`);

    try {
      const connection = this.programService.getConnection();
      const programId = this.programService.getProgramId();

      // Get current slot
      const currentSlot = await connection.getSlot('confirmed');

      if (this.lastProcessedSlot === 0) {
        // First run - start from recent history (last 100 slots)
        this.lastProcessedSlot = Math.max(0, currentSlot - 100);
      }

      // Don't process if we're caught up (within 2 slots)
      if (currentSlot - this.lastProcessedSlot < 2) {
        this.logger.debug('Indexer is caught up');
        return { status: 'caught_up', currentSlot, lastProcessed: this.lastProcessedSlot };
      }

      // Fetch signatures for the program in the slot range
      // Process in batches to avoid overwhelming RPC
      const batchSize = 50;
      let processedCount = 0;

      const startSlot = this.lastProcessedSlot + 1;
      const endSlot = Math.min(startSlot + batchSize, currentSlot);

      this.logger.log(`Syncing slots ${startSlot} to ${endSlot}`);

      // Fetch transactions
      const signatures = await connection.getSignaturesForAddress(
        programId,
        { minContextSlot: startSlot },
        'confirmed',
      );

      // Process each transaction
      for (const sigInfo of signatures) {
        try {
          // Skip if already processed
          const existing = await this.prisma.event.findUnique({
            where: { signature: sigInfo.signature },
          });

          if (existing) {
            continue;
          }

          // Fetch full transaction
          const tx = await connection.getTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0,
          });

          if (!tx) {
            continue;
          }

          // Parse instruction (simplified - in production, decode via IDL)
          const instruction = this.parseInstruction(tx);

          // Store event
          await this.prisma.event.create({
            data: {
              signature: sigInfo.signature,
              programId: programId.toString(),
              instruction: instruction.name,
              slot: BigInt(sigInfo.slot),
              timestamp: BigInt(sigInfo.blockTime || Math.floor(Date.now() / 1000)),
              commitment: 'confirmed',
              finalized: false,
              payload: instruction.data,
            },
          });

          processedCount++;
        } catch (error) {
          this.logger.error(`Failed to process signature ${sigInfo.signature}: ${error.message}`);
        }
      }

      this.lastProcessedSlot = endSlot;

      this.logger.log(`Indexed ${processedCount} transactions, current slot: ${currentSlot}`);

      return {
        success: true,
        processed: processedCount,
        slotRange: { start: startSlot, end: endSlot },
        currentSlot,
      };
    } catch (error) {
      this.logger.error(`Indexer sync failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  private parseInstruction(tx: any): { name: string; data: any } {
    // Simplified instruction parsing
    // In production, use Anchor IDL to decode instructions properly
    try {
      const instruction = tx.transaction?.message?.instructions?.[0];

      if (!instruction) {
        return { name: 'unknown', data: {} };
      }

      // Parse instruction discriminator to determine type
      // This is a simplified version - real implementation would use IDL
      return {
        name: 'program_instruction',
        data: {
          programIdIndex: instruction.programIdIndex,
          accounts: instruction.accounts || [],
          data: instruction.data || '',
        },
      };
    } catch (error) {
      return { name: 'parse_error', data: { error: error.message } };
    }
  }
}
