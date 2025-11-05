import { IsString, IsNumber, IsNotEmpty, Min, IsOptional } from 'class-validator';

export class GetFeeDiscountDto {
  @IsString()
  @IsNotEmpty()
  wallet: string;
}

export class GetStakingHistoryDto {
  @IsString()
  @IsNotEmpty()
  wallet: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  days?: number;
}
