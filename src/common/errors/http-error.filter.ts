import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from './domain.error.js';
import { ErrorCodes } from './error-codes.js';

// Every error leaves the API in one envelope:
//   { error: { code, message, details? } }
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      return response.status(exception.status).json({
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      });
    }

    if (exception instanceof HttpException) {
      // ValidationPipe rejections land here; normalize them into the envelope.
      const payload = exception.getResponse() as string | { message?: unknown };
      const raw = typeof payload === 'string' ? payload : payload.message;
      const message = Array.isArray(raw)
        ? raw.join('; ')
        : String(raw ?? exception.message);
      return response.status(exception.getStatus()).json({
        error: { code: ErrorCodes.VALIDATION_FAILED, message },
      });
    }

    this.logger.error(
      exception instanceof Error ? exception.stack : String(exception),
    );
    return response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: 'Unexpected server error',
      },
    });
  }
}
