import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, IsOptional, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';

export class ClaimRewardsDto {
  @ApiProperty({
    description: 'Position seed for the staking position',
    example: 12345,
  })
  @IsNumber()
  @IsNotEmpty()
  positionSeed: number;

  @ApiProperty({
    description: 'Optional NFT seed (generated if not provided)',
    example: 67890,
    required: false,
  })
  @IsNumber()
  @IsOptional()
  nftSeed?: number;
}

export class VestRewardDto {
  @ApiProperty({
    description: 'NFT seed identifying the reward NFT',
    example: 67890,
  })
  @IsNumber()
  @IsNotEmpty()
  nftSeed: number;
}

export class GetRewardNftsDto {
  @ApiProperty({
    description: 'Wallet address to query NFTs for',
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
