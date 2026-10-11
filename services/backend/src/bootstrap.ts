import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ApiModule } from './modules.js';
import { SafeErrors } from './http/security.js';

export async function createApi() {
  const app = await NestFactory.create(ApiModule, {
    logger: ['error', 'warn'],
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );
  app.useGlobalFilters(new SafeErrors());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('RepoPilot AI local demo')
      .setVersion(
        (
          JSON.parse(
            readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
          ) as { version: string }
        ).version,
      )
      .setDescription(
        'Fixed local workspace. Deterministic Demo provider only; production startup is refused.',
      )
      .build(),
    { operationIdFactory: (controller, method) => `${controller}_${method}` },
  );
  SwaggerModule.setup('api/docs', app, document);
  return { app, document };
}
