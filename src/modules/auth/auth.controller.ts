import { Controller, Post, Body, UseGuards, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetNonceDto, VerifySignatureDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('nonce')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get authentication nonce for wallet' })
  @ApiResponse({ status: 200, description: 'Nonce generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid wallet address' })
  async getNonce(@Body() dto: GetNonceDto) {
    return this.authService.getNonce(dto.wallet);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify signature and get JWT token' })
  @ApiResponse({ status: 200, description: 'Authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid signature or expired message' })
  async verify(@Body() dto: VerifySignatureDto) {
    return this.authService.verify(dto.wallet, dto.signature, dto.message);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and revoke current session' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(@Req() req: any) {
    await this.authService.revokeSession(req.user.jti);
    return { message: 'Logged out successfully' };
  }
}
