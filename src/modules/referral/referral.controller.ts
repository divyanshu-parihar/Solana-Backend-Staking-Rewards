import { Controller, Get, Post, Body, Query, UseGuards, Logger } from '@nestjs/common';
import { ReferralService } from './referral.service';
import { CreateReferralDto, PayWelcomeBonusDto } from './dto/referral.dto';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';

@Controller('api/v1/referral')
export class ReferralController {
  private readonly logger = new Logger(ReferralController.name);

  constructor(private readonly referralService: ReferralService) {}

  @Post('create')
  async createReferral(@Body() dto: CreateReferralDto) {
    return this.referralService.createReferral(
      dto.referrerWallet,
      dto.referredWallet,
      dto.deviceId,
      dto.ipAddress,
      dto.userAgent,
    );
  }

  @Post('welcome-bonus')
  @UseGuards(JwtAuthGuard)
  async payWelcomeBonus(@Body() dto: PayWelcomeBonusDto) {
    return this.referralService.payWelcomeBonus(dto.referredWallet);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async getReferralStats(@Query('wallet') wallet: string) {
    return this.referralService.getReferralStats(wallet);
  }
}
