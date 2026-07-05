import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { RedisStore } from 'connect-redis';
import type { RedisClientType } from 'redis';
import { AppModule } from './app.module';
import { SESSION_REDIS_CLIENT } from './redis/redis.module';
import { CsrfMiddleware } from './auth/csrf.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const sessionRedis = app.get<RedisClientType>(SESSION_REDIS_CLIENT);

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  if (config.get<string>('NODE_ENV') === 'production') {
    // Without this, express-session sees req.secure as false behind a
    // TLS-terminating reverse proxy (the normal prod topology), so it
    // silently refuses to set the secure cookie and login breaks.
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
  }
  app.use(cookieParser());
  app.use(
    session({
      store: new RedisStore({ client: sessionRedis, prefix: 'sess:' }),
      secret: config.get<string>('SESSION_SECRET')!,
      name: config.get<string>('SESSION_COOKIE_NAME')!,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.get<string>('NODE_ENV') === 'production',
        maxAge: config.get<number>('SESSION_TTL_SECONDS')! * 1000,
      },
    }),
  );
  const csrfMiddleware = new CsrfMiddleware();
  app.use(csrfMiddleware.use.bind(csrfMiddleware));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: config.get<string>('WEB_BASE_URL'),
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('IoT Platform API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(config.get<number>('PORT')!);
}
bootstrap();
