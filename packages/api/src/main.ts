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

  // CORS — restrict to the configured origins. `origin: true` (reflect any
  // origin) with credentials:true is a CSRF/data-exfil risk in production.
  // We read the allow-list from API_CORS_ORIGINS (comma-separated). In dev,
  // if the var is unset we fall back to reflecting the origin so local work
  // isn't blocked; in production an unset var means "deny cross-origin".
  const isProd = process.env.NODE_ENV === 'production';
  const corsOrigins = (process.env.API_CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (corsOrigins.length > 0) {
    app.enableCors({ origin: corsOrigins, credentials: true });
    logger.log(`CORS restricted to: ${corsOrigins.join(', ')}`);
  } else if (isProd) {
    // No allow-list in prod → same-origin only (no cross-origin credentials).
    app.enableCors({ origin: false, credentials: true });
    logger.warn('API_CORS_ORIGINS is empty in production — cross-origin requests are blocked.');
  } else {
    app.enableCors({ origin: true, credentials: true });
    logger.log('CORS in dev mode: reflecting request origin.');
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
