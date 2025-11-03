import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async check() {
    return this.healthService.check();
  }

  @Get('readiness')
  @ApiOperation({ summary: 'Readiness check for Kubernetes' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  async readiness() {
    return this.healthService.readiness();
  }

  @Get('liveness')
  @ApiOperation({ summary: 'Liveness check for Kubernetes' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  async liveness() {
    return this.healthService.liveness();
  }
}
