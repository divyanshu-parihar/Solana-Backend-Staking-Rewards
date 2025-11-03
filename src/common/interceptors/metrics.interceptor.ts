import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from '@observability/metrics.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = (Date.now() - startTime) / 1000;
          this.metricsService.recordHttpRequest(
            request.method,
            request.route?.path || request.url,
            response.statusCode,
            duration,
          );
        },
        error: () => {
          const duration = (Date.now() - startTime) / 1000;
          this.metricsService.recordHttpRequest(
            request.method,
            request.route?.path || request.url,
            response.statusCode || 500,
            duration,
          );
        },
      }),
    );
  }
}
