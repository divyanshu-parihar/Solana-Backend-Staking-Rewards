import { IsString, IsOptional, IsNotEmpty } from 'class-validator';

export class CreateReferralDto {
  @IsString()
  @IsNotEmpty()
  referrerWallet: string;

  @IsString()
  @IsNotEmpty()
  referredWallet: string;

  @IsString()
  @IsOptional()
  deviceId?: string;

  @IsString()
  @IsOptional()
  ipAddress?: string;

  @IsString()
  @IsOptional()
  userAgent?: string;
}

export class PayWelcomeBonusDto {
  @IsString()
  @IsNotEmpty()
  referredWallet: string;
}
