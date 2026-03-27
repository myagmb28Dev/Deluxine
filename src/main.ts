process.env.TZ = 'Asia/Seoul';

import { NestFactory, HttpAdapterHost } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  const configService = app.get(ConfigService);
  const httpAdapter = app.get(HttpAdapterHost);

  app.use(json({ limit: '8mb' }));
  app.use(urlencoded({ extended: true, limit: '8mb' }));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter(httpAdapter));

  app.enableCors({
    // app.corsOrigin supports '*' or an array of allowed origins (comma-separated via env CORS_ORIGIN)
    origin: configService.get('app.corsOrigin') ?? '*',
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Deluxine API')
    .setDescription('선화-포즈-렌더 파이프라인 API')
    .setVersion('1.0.0')
    .addBearerAuth({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'Firebase',
      description: 'Firebase ID Token (Authorization: Bearer <token>)',
    }, 'access-token')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  const port = configService.get<number>('app.port') ?? 3000;
  await app.listen(port);
}
bootstrap();
