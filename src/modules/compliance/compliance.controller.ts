import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import {
  GetComplianceStatusDto,
  AddToAllowlistDto,
  AddToDenylistDto,
  RemoveFromListDto,
  SyncAllowlistDto,
} from './dto/compliance.dto';

@ApiTags('compliance')
@Controller('compliance')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ComplianceController {
  constructor(private complianceService: ComplianceService) {}

  @Get('status')
  @ApiOperation({ summary: 'Get compliance status for a wallet' })
  @ApiQuery({ name: 'wallet', required: true })
  @ApiResponse({ status: 200, description: 'Status retrieved successfully' })
  async getStatus(@Query() query: GetComplianceStatusDto) {
    return await this.complianceService.getComplianceStatus(query.wallet);
  }

  @Post('allowlist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add wallet to allowlist (Admin only)' })
  @ApiResponse({ status: 200, description: 'Wallet added to allowlist' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  async addToAllowlist(@Body() dto: AddToAllowlistDto) {
    return await this.complianceService.addToAllowlist(dto.wallet, dto.source);
  }

  @Post('denylist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add wallet to denylist (Admin only)' })
  @ApiResponse({ status: 200, description: 'Wallet added to denylist' })
  async addToDenylist(@Body() dto: AddToDenylistDto) {
    return await this.complianceService.addToDenylist(dto.wallet, dto.source);
  }

  @Delete('remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove wallet from compliance lists (Admin only)' })
  @ApiResponse({ status: 200, description: 'Wallet removed' })
  @ApiResponse({ status: 400, description: 'Wallet not found' })
  async removeFromList(@Body() dto: RemoveFromListDto) {
    return await this.complianceService.removeFromList(dto.wallet);
  }

  @Post('sync-allowlist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk sync allowlist from external source (Admin only)' })
  @ApiResponse({ status: 200, description: 'Allowlist synced' })
  async syncAllowlist(@Body() dto: SyncAllowlistDto) {
    return await this.complianceService.syncAllowlist(dto.wallets, dto.source);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get compliance statistics' })
  @ApiResponse({ status: 200, description: 'Stats retrieved successfully' })
  async getStats() {
    return await this.complianceService.getComplianceStats();
  }
}
