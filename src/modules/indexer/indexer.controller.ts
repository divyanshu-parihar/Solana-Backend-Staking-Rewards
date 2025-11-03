import { Controller, Get, Post, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { IndexerService } from './indexer.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';

@ApiTags('indexer')
@Controller('indexer')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class IndexerController {
  constructor(private indexerService: IndexerService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get indexer status' })
  @ApiResponse({ status: 200, description: 'Status retrieved successfully' })
  async getStatus() {
    return await this.indexerService.getIndexerStatus();
  }

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start the indexer (Admin only)' })
  @ApiResponse({ status: 200, description: 'Indexer started' })
  async startIndexer() {
    await this.indexerService.startIndexer();
    return { message: 'Indexer started successfully' };
  }

  @Post('stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop the indexer (Admin only)' })
  @ApiResponse({ status: 200, description: 'Indexer stopped' })
  async stopIndexer() {
    await this.indexerService.stopIndexer();
    return { message: 'Indexer stopped successfully' };
  }

  @Post('reconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reconcile database state with blockchain (Admin only)' })
  @ApiResponse({ status: 200, description: 'Reconciliation complete' })
  async reconcile() {
    const result = await this.indexerService.reconcileState();
    return {
      message: 'State reconciliation complete',
      ...result,
    };
  }
}
