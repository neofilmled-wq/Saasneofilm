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
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  // Redis adapter for multi-instance Socket.IO
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);

  // Security
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());
  app.enableCors({
    origin: process.env.API_CORS_ORIGINS?.split(',') || [
      'http://localhost:3000',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004',
      'http://10.0.2.2:3004',   // Android emulator
      'http://10.0.3.2:3004',   // Genymotion emulator
    ],
    credentials: true,
  });

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
