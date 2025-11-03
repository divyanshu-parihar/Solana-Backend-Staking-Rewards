import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

@ApiTags('observability')
@Controller()
export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  @Get('metrics')
  @ApiExcludeEndpoint() // Don't show in Swagger docs
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrics endpoint' })
  @ApiResponse({ status: 200, description: 'Metrics in Prometheus format' })
  async getMetrics(): Promise<string> {
    return await this.metricsService.getMetrics();
  }
}
