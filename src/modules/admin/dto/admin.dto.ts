import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsBoolean, IsOptional, Min, Max } from 'class-validator';

export class CreateTierDto {
  @ApiProperty({
    description: 'Tier ID',
    example: 1,
  })
  @IsNumber()
  @IsNotEmpty()
  tierId: number;

  @ApiProperty({
    description: 'Multiplier (percentage)',
    example: 150,
    minimum: 1,
    maximum: 500,
  })
  @IsNumber()
  @Min(1)
  @Max(500)
  @IsNotEmpty()
  multiplier: number;

  @ApiProperty({
    description: 'Minimum duration in months',
    example: 1,
  })
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  minMonths: number;

  @ApiProperty({
    description: 'Maximum duration in months',
    example: 12,
  })
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  maxMonths: number;

  @ApiProperty({
    description: 'Is tier active',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateTierDto {
  @ApiProperty({
    description: 'Multiplier (percentage)',
    example: 200,
    minimum: 1,
    maximum: 500,
    required: false,
  })
  @IsNumber()
  @Min(1)
  @Max(500)
  @IsOptional()
  multiplier?: number;

  @ApiProperty({
    description: 'Minimum duration in months',
    example: 1,
    required: false,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  minMonths?: number;

  @ApiProperty({
    description: 'Maximum duration in months',
    example: 24,
    required: false,
  })
  @IsNumber()
  @Min(1)
  @IsOptional()
  maxMonths?: number;

  @ApiProperty({
    description: 'Is tier active',
    example: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ReplenishPoolDto {
  @ApiProperty({
    description: 'Amount to add to reward pool (in lamports)',
    example: 1000000000,
  })
  @IsNumber()
  @Min(1)
  @IsNotEmpty()
  amount: number;
}
