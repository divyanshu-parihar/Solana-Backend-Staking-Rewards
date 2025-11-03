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
import { RewardsService } from './rewards.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { ClaimRewardsDto, VestRewardDto, GetRewardNftsDto } from './dto/rewards.dto';

@ApiTags('rewards')
@Controller('rewards')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RewardsController {
  constructor(private rewardsService: RewardsService) {}

  @Post('claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim staking rewards (creates NFT vesting receipt)' })
  @ApiResponse({ status: 200, description: 'Rewards claimed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid parameters or cooldown not met' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Position not found' })
  async claim(@Req() req: any, @Body() dto: ClaimRewardsDto) {
    return this.rewardsService.claimRewards(req.user.wallet, dto.positionSeed, dto.nftSeed);
  }

  @Post('vest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vest reward NFT after 1 year vesting period' })
  @ApiResponse({ status: 200, description: 'Reward vested successfully' })
  @ApiResponse({ status: 400, description: 'Vesting period not complete or already vested' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Reward NFT not found' })
  async vest(@Req() req: any, @Body() dto: VestRewardDto) {
    return this.rewardsService.vestReward(req.user.wallet, dto.nftSeed);
  }

  @Get('nfts')
  @ApiOperation({ summary: 'Get reward NFTs' })
  @ApiResponse({ status: 200, description: 'NFTs retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getNfts(@Req() req: any, @Query() query: GetRewardNftsDto) {
    const wallet = query.owner || req.user.wallet;
    return this.rewardsService.getRewardNfts(wallet, query.isActive);
  }
}
