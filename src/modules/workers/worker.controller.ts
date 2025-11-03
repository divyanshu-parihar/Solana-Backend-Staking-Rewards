import { Controller, Post, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { WorkerService } from './worker.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';

@ApiTags('workers')
@Controller('workers')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WorkerController {
  constructor(private workerService: WorkerService) {}

  @Post('distribute-weekly')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually trigger weekly reward distribution (Admin only)' })
  @ApiResponse({ status: 200, description: 'Job queued successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async triggerWeeklyDistribution() {
    const job = await this.workerService.triggerWeeklyDistribution();
    return {
      message: 'Weekly reward distribution job queued',
      jobId: job.id,
    };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get worker queue statistics' })
  @ApiResponse({ status: 200, description: 'Queue stats retrieved' })
  async getQueueStats() {
    return await this.workerService.getQueueStats();
  }
}
