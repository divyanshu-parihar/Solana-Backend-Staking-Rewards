import { Controller, Get, Post, Body, Query, UseGuards, Logger } from '@nestjs/common';
import { CashbackService } from './cashback.service';
import { DistributeCashbackDto, FundPoolsDto } from './dto/cashback.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';

@Controller('api/v1/cashback')
export class CashbackController {
  private readonly logger = new Logger(CashbackController.name);

  constructor(private readonly cashbackService: CashbackService) {}

  @Post('initialize')
  async initializePools() {
    return this.cashbackService.initializePools();
  }

  @Post('fund')
  @UseGuards(JwtAuthGuard)
  async fundPools(@Body() dto: FundPoolsDto) {
    return this.cashbackService.fundPools(dto.perpetualAmount, dto.bonusAmount);
  }

  @Post('distribute')
  @UseGuards(JwtAuthGuard)
  async distributeCashback(@Body() dto: DistributeCashbackDto) {
    return this.cashbackService.distributeCashback(dto.wallet, dto.tradingVolume, dto.userId);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getUserCashbackHistory(@Query('wallet') wallet: string) {
    return this.cashbackService.getUserCashbackHistory(wallet);
  }

  @Get('pools')
  async getPoolsStatus() {
    return this.cashbackService.getPoolsStatus();
  }
}
