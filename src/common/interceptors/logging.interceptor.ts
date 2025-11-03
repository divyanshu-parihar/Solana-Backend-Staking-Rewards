import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  private bigIntReplacer(key: string, value: any) {
    if (typeof value === 'bigint') {
      return value.toString();
    }
    return value;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, headers } = request;
    const userAgent = headers['user-agent'] || '';
    const requestId = headers['x-request-id'] || 'no-request-id';
    const isTestMode = process.env.NODE_ENV === 'test';

    const now = Date.now();

    // Always log in test mode to show test operations
    if (isTestMode) {
      console.log(`[TEST] ${method} ${url}`);
      this.logger.log(`[TEST] ${method} ${url}`);
      if (Object.keys(body || {}).length > 0) {
        const bodyStr = JSON.stringify(body, this.bigIntReplacer);
        console.log(`[TEST] Request Body: ${bodyStr}`);
        this.logger.log(`[TEST] Request Body: ${bodyStr}`);
      }
    } else {
      this.logger.log(
        `Incoming: ${method} ${url} - User-Agent: ${userAgent} - Request ID: ${requestId}`,
      );

      if (process.env.LOG_LEVEL === 'debug' && Object.keys(body || {}).length > 0) {
        this.logger.debug(`Request Body: ${JSON.stringify(body, this.bigIntReplacer)}`);
      }
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          const response = context.switchToHttp().getResponse();
          const { statusCode } = response;
          const duration = Date.now() - now;
          const isTestMode = process.env.NODE_ENV === 'test';

          if (isTestMode) {
            const responseMsg = `[TEST] ✓ ${method} ${url} → ${statusCode} (${duration}ms)`;
            console.log(responseMsg);
            this.logger.log(responseMsg);
            // Log response in test mode for visibility
            if (statusCode < 400) {
              const responseData = JSON.stringify(data, this.bigIntReplacer);
              const responsePreview =
                responseData.length > 200 ? responseData.substring(0, 200) + '...' : responseData;
              console.log(`[TEST] Response: ${responsePreview}`);
              this.logger.log(`[TEST] Response: ${responsePreview}`);
            }
          } else {
            this.logger.log(
              `Completed: ${method} ${url} ${statusCode} - ${duration}ms - Request ID: ${requestId}`,
            );

            if (process.env.LOG_LEVEL === 'debug') {
              this.logger.debug(`Response: ${JSON.stringify(data, this.bigIntReplacer)}`);
            }
          }
        },
        error: (error) => {
          const duration = Date.now() - now;
          const isTestMode = process.env.NODE_ENV === 'test';
          const statusCode = error?.status || error?.statusCode || 500;
          const isClientError = statusCode >= 400 && statusCode < 500;

          // Suppress expected client errors (4xx) during tests to reduce noise
          if (isTestMode && isClientError) {
            // Only log as debug in test mode for expected errors
            this.logger.debug(
              `[Test] Failed: ${method} ${url} - ${duration}ms - ${statusCode} - Request ID: ${requestId}`,
            );
          } else {
            // Log server errors (5xx) and non-test mode errors normally
            this.logger.error(
              `Failed: ${method} ${url} - ${duration}ms - Request ID: ${requestId}`,
              error.stack,
            );
          }
        },
      }),
    );
  }
}
