process.env.TZ = 'Asia/Seoul';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrapWorker() {
  const logger = new Logger('WorkerBootstrap');

  // Worker must process BullMQ queues; enable processors by default.
  if (!process.env.ENABLE_QUEUE_PROCESSORS) {
    process.env.ENABLE_QUEUE_PROCESSORS = 'true';
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  logger.log('Worker application context started');

  const shutdown = async (signal: string) => {
    logger.warn(`Received ${signal}, shutting down...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrapWorker();

