import * as path from 'path';
import { config as dotenvConfig } from 'dotenv';

// Load root .env before anything else (Prisma needs DATABASE_URL at import time)
dotenvConfig({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

// Prevent unhandled Redis/BullMQ connection errors from crashing the process
const bootLogger = console;
process.on('uncaughtException', (err) => {
  if (err && (err as any).code === 'ECONNREFUSED') {
    bootLogger.warn(`[Bootstrap] Suppressed ECONNREFUSED: ${err.message}`);
    return;
  }
  bootLogger.error('[Bootstrap] Uncaught exception:', err);
  process.exit(1);
});

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';
import { TransformInterceptor, LoggingInterceptor } from './common/interceptors';
import { RedisIoAdapter } from './modules/realtime/redis-io-adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const logger = new Logger('Bootstrap');

  // Redis adapter for multi-instance Socket.IO
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // Security
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  // CORS — SAFE BY DEFAULT (reflect request origin, the previous behaviour) so
  // a misconfigured/legacy API_CORS_ORIGINS value can never brick production.
  // Tightening to the allow-list is OPT-IN via API_CORS_STRICT=true, meant to
  // be enabled only after the allow-list has been verified (ideally on a
  // staging env). Without opt-in we keep working exactly as before.
  const corsOrigins = (process.env.API_CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const corsStrict = process.env.API_CORS_STRICT === 'true';
  if (corsStrict && corsOrigins.length > 0) {
    app.enableCors({ origin: corsOrigins, credentials: true });
    logger.log(`CORS strict — allow-list: ${corsOrigins.join(', ')}`);
  } else {
    app.enableCors({ origin: true, credentials: true });
    if (corsStrict) {
      logger.warn('API_CORS_STRICT=true but API_CORS_ORIGINS is empty — reflecting origin to avoid blocking.');
    }
  }

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global filters & interceptors
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('NeoFilm API')
    .setDescription('NeoFilm SaaS Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT || 3001;
  await app.listen(port);
  logger.log(`NeoFilm API running on http://localhost:${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/api/docs`);
}

bootstrap();
