import { Controller, Get, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { InsightsService } from './insights.service';

@ApiTags('insights')
@Controller('insights')
export class InsightsController {
  constructor(private insightsService: InsightsService) {}

  @Get('epoch')
  @ApiOperation({ summary: 'Get current epoch information' })
  @ApiResponse({ status: 200, description: 'Epoch info retrieved successfully' })
  async getCurrentEpoch() {
    return await this.insightsService.getCurrentEpoch();
  }

  @Get('power')
  @ApiOperation({ summary: 'Get staking power breakdown for a wallet' })
  @ApiQuery({ name: 'owner', required: true })
  @ApiResponse({ status: 200, description: 'Staking power retrieved' })
  async getStakingPower(@Query('owner') owner: string) {
    return await this.insightsService.getStakingPower(owner);
  }

  @Get('reward-preview')
  @ApiOperation({ summary: 'Get reward preview/estimate for a wallet' })
  @ApiQuery({ name: 'owner', required: true })
  @ApiResponse({ status: 200, description: 'Reward preview generated' })
  async getRewardPreview(@Query('owner') owner: string) {
    return await this.insightsService.getRewardPreview(owner);
  }

  @Get('protocol-stats')
  @ApiOperation({ summary: 'Get protocol-wide statistics' })
  @ApiResponse({ status: 200, description: 'Stats retrieved successfully' })
  async getProtocolStats() {
    return await this.insightsService.getProtocolStats();
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Get leaderboard of top stakers' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Leaderboard retrieved' })
  async getLeaderboard(@Query('limit', new ParseIntPipe({ optional: true })) limit?: number) {
    return await this.insightsService.getLeaderboard(limit);
  }
}
