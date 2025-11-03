import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StakingService } from './staking.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import {
  StakeTokensDto,
  UnstakeTokensDto,
  FinalizeUnstakeDto,
  GetPositionsDto,
} from './dto/staking.dto';

@ApiTags('staking')
@Controller('staking')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StakingController {
  constructor(private stakingService: StakingService) {}

  @Post('stake')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Stake tokens' })
  @ApiResponse({ status: 201, description: 'Stake position created' })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async stake(@Req() req: any, @Body() dto: StakeTokensDto) {
    return this.stakingService.stakeTokens(
      req.user.wallet,
      dto.amount,
      dto.durationMonths,
      dto.tierId,
      dto.isLocked,
      dto.positionSeed,
    );
  }

  @Post('unstake')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate unstaking (starts cooldown)' })
  @ApiResponse({ status: 200, description: 'Unstake initiated' })
  @ApiResponse({ status: 400, description: 'Invalid parameters or cooldown already active' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Position not found' })
  async unstake(@Req() req: any, @Body() dto: UnstakeTokensDto) {
    return this.stakingService.unstakeTokens(req.user.wallet, dto.positionSeed);
  }

  @Post('finalize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Finalize unstaking after cooldown period' })
  @ApiResponse({ status: 200, description: 'Unstake finalized' })
  @ApiResponse({ status: 400, description: 'Cooldown not complete or no pending unstake' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Position not found' })
  async finalize(@Req() req: any, @Body() dto: FinalizeUnstakeDto) {
    return this.stakingService.finalizeUnstake(req.user.wallet, dto.positionSeed);
  }

  @Get('positions')
  @ApiOperation({ summary: 'Get staking positions' })
  @ApiResponse({ status: 200, description: 'Positions retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPositions(@Req() req: any, @Query() query: GetPositionsDto) {
    const wallet = query.owner || req.user.wallet;
    return this.stakingService.getPositions(wallet, query.isActive);
  }

  @Get('tiers')
  @ApiOperation({ summary: 'Get available staking tiers' })
  @ApiResponse({ status: 200, description: 'Tiers retrieved successfully' })
  async getTiers() {
    // This will be implemented by admin module
    // For now, return a placeholder
    return {
      message: 'Use /admin/tiers endpoint to get tier information',
    };
  }
}
