import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from '@fastify/helmet';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true, bodyLimit: 54857600 }),
  );

  // Sécurité HTTP
  await app.register(helmet);
  app.enableCors({
    origin: process.env.WEB_URL?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  // Validation globale (class-validator) + Zod côté services
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Versioning /api/v1
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // OpenAPI (réutilisable par les futures apps mobiles)
  const config = new DocumentBuilder()
    .setTitle('MISTERDOU-PRO API')
    .setDescription('Marketplace sécurisée de comptes eFootball')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  console.log(`API running on http://localhost:${port} — docs: /api/docs`);
}
bootstrap();
