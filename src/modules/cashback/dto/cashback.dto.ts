import { IsString, IsNumber, IsNotEmpty, Min } from 'class-validator';

export class DistributeCashbackDto {
  @IsString()
  @IsNotEmpty()
  wallet: string;

  @IsNumber()
  @Min(0)
  tradingVolume: number;

  @IsString()
  @IsNotEmpty()
  userId: string;
}

export class FundPoolsDto {
  @IsNumber()
  @Min(0)
  perpetualAmount: number;

  @IsNumber()
  @Min(0)
  bonusAmount: number;
}
