import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { HttpErrorFilter } from './common/errors/http-error.filter.js';

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpErrorFilter());
  app.getHttpAdapter().getInstance().disable('x-powered-by');
}
