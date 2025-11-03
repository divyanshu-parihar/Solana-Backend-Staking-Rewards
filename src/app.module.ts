import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { ObservabilityModule } from './observability/observability.module';
import { AuthModule } from './modules/auth/auth.module';
import { ProgramModule } from './modules/program/program.module';
import { StakingModule } from './modules/staking/staking.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { AdminModule } from './modules/admin/admin.module';
import { HealthModule } from './modules/health/health.module';
import { WorkersModule } from './modules/workers/workers.module';
import { IndexerModule } from './modules/indexer/indexer.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { InsightsModule } from './modules/insights/insights.module';
import { AllExceptionsFilter } from './common/errors/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';
import { IdempotencyMiddleware } from './common/middleware/idempotency.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 100, // 100 requests per TTL
      },
    ]),
    RedisModule,
    PrismaModule,
    ObservabilityModule,
    AuthModule,
    ProgramModule,
    StakingModule,
    RewardsModule,
    AdminModule,
    HealthModule,
    WorkersModule,
    IndexerModule,
    ComplianceModule,
    InsightsModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: MetricsInterceptor,
    },
    {
      provide: 'APP_GUARD',
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(IdempotencyMiddleware).forRoutes('*');
  }
}
