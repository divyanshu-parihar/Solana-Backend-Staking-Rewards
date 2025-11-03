import { IsString, IsArray, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GetComplianceStatusDto {
  @ApiProperty({ description: 'Wallet address to check' })
  @IsString()
  wallet: string;
}

export class AddToAllowlistDto {
  @ApiProperty({ description: 'Wallet address to add to allowlist' })
  @IsString()
  wallet: string;

  @ApiPropertyOptional({ description: 'Source of verification' })
  @IsOptional()
  @IsString()
  source?: string;
}

export class AddToDenylistDto {
  @ApiProperty({ description: 'Wallet address to add to denylist' })
  @IsString()
  wallet: string;

  @ApiPropertyOptional({ description: 'Reason for denial' })
  @IsOptional()
  @IsString()
  source?: string;
}

export class RemoveFromListDto {
  @ApiProperty({ description: 'Wallet address to remove from lists' })
  @IsString()
  wallet: string;
}

export class SyncAllowlistDto {
  @ApiProperty({ description: 'Array of wallet addresses to sync', type: [String] })
  @IsArray()
  @IsString({ each: true })
  wallets: string[];

  @ApiProperty({ description: 'Source of the allowlist' })
  @IsString()
  source: string;
}
