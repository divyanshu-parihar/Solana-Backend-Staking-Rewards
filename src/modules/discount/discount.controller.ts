import { Controller, Get, Post, Query, UseGuards, Logger } from '@nestjs/common';
import { DiscountService } from './discount.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';

@Controller('api/v1/discount')
export class DiscountController {
  private readonly logger = new Logger(DiscountController.name);

  constructor(private readonly discountService: DiscountService) {}

  @Post('snapshot')
  @UseGuards(JwtAuthGuard)
  async createDailySnapshots() {
    return this.discountService.createDailySnapshots();
  }

  @Get('fee-discount')
  async getFeeDiscount(@Query('wallet') wallet: string) {
    return this.discountService.getFeeDiscount(wallet);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  async getUserStakingHistory(@Query('wallet') wallet: string, @Query('days') days?: number) {
    const daysNum = days ? parseInt(days.toString(), 10) : 30;
    return this.discountService.getUserStakingHistory(wallet, daysNum);
  }
}
