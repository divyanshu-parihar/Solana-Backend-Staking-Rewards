// Initialize OpenTelemetry tracing in production
if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('./observability/tracing').initializeTracing();
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  const configService = app.get(ConfigService);

  // Global prefix
  const apiPrefix = configService.get<string>('app.apiPrefix') || 'api/v1';
  app.setGlobalPrefix(apiPrefix);

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Security
  app.use(helmet());

  // CORS
  const corsOrigin = configService.get<string[]>('app.corsOrigin');
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
  });

  // Swagger documentation
  if (configService.get<string>('app.env') !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Solana Staking & Rewards API')
      .setDescription('Production-ready backend for Solana staking and rewards protocol')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication endpoints')
      .addTag('staking', 'Staking operations')
      .addTag('rewards', 'Rewards and NFT vesting')
      .addTag('admin', 'Admin operations')
      .addTag('workers', 'Background job management')
      .addTag('indexer', 'Blockchain event indexer')
      .addTag('compliance', 'KYC/AML compliance')
      .addTag('insights', 'Analytics and insights')
      .addTag('observability', 'Metrics and monitoring')
      .addTag('health', 'Health check endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);

    logger.log(
      `Swagger documentation available at http://localhost:${configService.get<number>('app.port')}/docs`,
    );
  }

  const port = configService.get<number>('app.port') || 3000;
  const env = configService.get<string>('app.env') || 'development';
  await app.listen(port);

  logger.log(`
    ╔═══════════════════════════════════════════════════════════╗
    ║                                                           ║
    ║   Solana Staking & Rewards Backend                       ║
    ║   Version: 1.0.0                                          ║
    ║   Environment: ${env.padEnd(40)}║
    ║   Port: ${port.toString().padEnd(48)}║
    ║   API: http://localhost:${port}/${apiPrefix.padEnd(34)}║
    ║                                                           ║
    ╚═══════════════════════════════════════════════════════════╝
  `);
}

bootstrap().catch((error) => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
