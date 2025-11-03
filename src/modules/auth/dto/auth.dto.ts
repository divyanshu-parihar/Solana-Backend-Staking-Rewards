import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class GetNonceDto {
  @ApiProperty({
    description: 'Solana wallet public key',
    example: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  })
  @IsString()
  @IsNotEmpty()
  wallet: string;
}

export class VerifySignatureDto {
  @ApiProperty({
    description: 'Solana wallet public key',
    example: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
  })
  @IsString()
  @IsNotEmpty()
  wallet: string;

  @ApiProperty({
    description: 'Base58 encoded signature',
    example: '2Vz4...',
  })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({
    description: 'Message that was signed',
    example: 'Sign this message to authenticate...',
  })
  @IsString()
  @IsNotEmpty()
  message: string;
}
