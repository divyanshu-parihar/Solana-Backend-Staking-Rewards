import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '@prisma/prisma.service';
import { ProgramService } from '@modules/program/program.service';

interface RetryTransactionData {
  signature: string;
  instruction: string;
  wallet: string;
  payload: any;
  attempt: number;
}

@Processor('transaction-retry')
export class TransactionRetryProcessor {
  private readonly logger = new Logger(TransactionRetryProcessor.name);
  private readonly MAX_RETRIES = 5;

  constructor(
    private prisma: PrismaService,
    private programService: ProgramService,
  ) {}

  @Process('retry-transaction')
  async handleTransactionRetry(job: Job<RetryTransactionData>) {
    const { signature, instruction, payload, attempt } = job.data;

    this.logger.log(
      `Retrying transaction ${signature}, instruction: ${instruction}, attempt: ${attempt}`,
    );

    try {
      // Check if transaction already succeeded on-chain
      const connection = this.programService.getConnection();
      const txStatus = await connection.getSignatureStatus(signature);

      if (
        txStatus?.value?.confirmationStatus === 'confirmed' ||
        txStatus?.value?.confirmationStatus === 'finalized'
      ) {
        this.logger.log(`Transaction ${signature} already confirmed`);

        // Update event record if exists
        await this.prisma.event.updateMany({
          where: { signature },
          data: {
            commitment: txStatus.value.confirmationStatus,
            finalized: txStatus.value.confirmationStatus === 'finalized',
          },
        });

        return { success: true, status: 'already_confirmed' };
      }

      // Check if max retries exceeded
      if (attempt >= this.MAX_RETRIES) {
        this.logger.error(`Max retries exceeded for transaction ${signature}`);

        await this.prisma.event.updateMany({
          where: { signature },
          data: {
            payload: {
              ...payload,
              retryStatus: 'failed',
              maxRetriesExceeded: true,
              lastAttempt: attempt,
            },
          },
        });

        return { success: false, status: 'max_retries_exceeded' };
      }

      // In production, this would re-submit the transaction with:
      // - New blockhash
      // - Potentially higher priority fees
      // - Same instruction data

      this.logger.log(`Transaction ${signature} would be resubmitted (simulation mode)`);

      // For now, log the retry attempt
      await this.prisma.event.updateMany({
        where: { signature },
        data: {
          payload: {
            ...payload,
            retryAttempt: attempt,
            lastRetryAt: new Date().toISOString(),
          },
        },
      });

      return {
        success: true,
        status: 'retry_scheduled',
        attempt,
        nextAttempt: attempt + 1,
      };
    } catch (error) {
      this.logger.error(`Transaction retry failed: ${error.message}`, error.stack);

      // Schedule another retry if under max attempts
      if (attempt < this.MAX_RETRIES) {
        throw error; // Let Bull handle the retry with backoff
      }

      return { success: false, status: 'failed', error: error.message };
    }
  }
}
