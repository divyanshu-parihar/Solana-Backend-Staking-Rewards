import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  ParseBoolPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CreateTierDto, UpdateTierDto, ReplenishPoolDto } from './dto/admin.dto';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminController {
  constructor(private adminService: AdminService) {}

  @Post('tiers')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new staking tier (Admin only)' })
  @ApiResponse({ status: 201, description: 'Tier created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async createTier(@Req() req: any, @Body() dto: CreateTierDto) {
    return this.adminService.createTier(
      req.user.wallet,
      dto.tierId,
      dto.multiplier,
      dto.minMonths,
      dto.maxMonths,
      dto.isActive,
    );
  }

  @Patch('tiers/:tierId')
  @ApiOperation({ summary: 'Update staking tier (Admin only)' })
  @ApiParam({ name: 'tierId', description: 'Tier ID to update' })
  @ApiResponse({ status: 200, description: 'Tier updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid parameters' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'Tier not found' })
  async updateTier(
    @Req() req: any,
    @Param('tierId', ParseIntPipe) tierId: number,
    @Body() dto: UpdateTierDto,
  ) {
    return this.adminService.updateTier(req.user.wallet, tierId, dto);
  }

  @Get('tiers')
  @ApiOperation({ summary: 'Get all staking tiers' })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Tiers retrieved successfully' })
  async getTiers(@Query('isActive', new ParseBoolPipe({ optional: true })) isActive?: boolean) {
    return this.adminService.getTiers(isActive);
  }

  @Post('pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause the program (Admin only)' })
  @ApiResponse({ status: 200, description: 'Program paused successfully' })
  @ApiResponse({ status: 400, description: 'Program already paused' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async pauseProgram(@Req() req: any) {
    return this.adminService.pauseProgram(req.user.wallet);
  }

  @Post('unpause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unpause the program (Admin only)' })
  @ApiResponse({ status: 200, description: 'Program unpaused successfully' })
  @ApiResponse({ status: 400, description: 'Program is not paused' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async unpauseProgram(@Req() req: any) {
    return this.adminService.unpauseProgram(req.user.wallet);
  }

  @Post('reward-pool/topup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Replenish the reward pool (Admin only)' })
  @ApiResponse({ status: 200, description: 'Pool replenished successfully' })
  @ApiResponse({ status: 400, description: 'Invalid amount' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async replenishPool(@Req() req: any, @Body() dto: ReplenishPoolDto) {
    return this.adminService.replenishRewardPool(req.user.wallet, dto.amount);
  }

  @Get('state')
  @ApiOperation({ summary: 'Get program state' })
  @ApiResponse({ status: 200, description: 'Program state retrieved successfully' })
  async getProgramState() {
    return this.adminService.getProgramState();
  }
}
