import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsBoolean, IsString, Min, Max, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class StakeTokensDto {
  @ApiProperty({
    description: 'Amount to stake in lamports',
    example: 1000000000,
  })
  @IsNumber()
  @Min(1000000) // MIN_STAKE_AMOUNT
  @IsNotEmpty()
  amount: number;

  @ApiProperty({
    description: 'Staking duration in months',
    example: 6,
    minimum: 1,
    maximum: 60,
  })
  @IsNumber()
  @Min(1)
  @Max(60)
  @IsNotEmpty()
  durationMonths: number;

  @ApiProperty({
    description: 'Staking tier ID',
    example: 1,
  })
  @IsNumber()
  @IsNotEmpty()
  tierId: number;

  @ApiProperty({
    description: 'Whether the stake is locked',
    example: true,
  })
  @IsBoolean()
  @IsNotEmpty()
  isLocked: boolean;

  @ApiProperty({
    description: 'Optional position seed (generated if not provided)',
    example: 12345,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  positionSeed?: number;
}

export class UnstakeTokensDto {
  @ApiProperty({
    description: 'Position seed identifying the stake',
    example: 12345,
  })
  @IsNumber()
  @IsNotEmpty()
  positionSeed: number;
}

export class FinalizeUnstakeDto {
  @ApiProperty({
    description: 'Position seed identifying the stake',
    example: 12345,
  })
  @IsNumber()
  @IsNotEmpty()
  positionSeed: number;
}

export class GetPositionsDto {
  @ApiProperty({
    description: 'Wallet address to query positions for',
    example: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    required: false,
  })
  @IsString()
  @IsOptional()
  owner?: string;

  @ApiProperty({
    description: 'Filter by active status',
    example: true,
    required: false,
  })
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
