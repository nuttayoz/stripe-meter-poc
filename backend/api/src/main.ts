import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const frontendOrigin = configService.getOrThrow<string>('FRONTEND_ORIGIN');

  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: frontendOrigin,
    credentials: true,
  });

  const port = Number(configService.getOrThrow<string>('PORT'));
  await app.listen(port, () => console.log('running on port', port));
}
void bootstrap();
