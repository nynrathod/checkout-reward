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

// One error shape for everything. Clients switch on 'code', they don't parse messages.
@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    // Our expected errors.
    if (exception instanceof DomainError) {
      return response.status(exception.status).json({
        error: {
          code: exception.code,
          message: exception.message,
          ...(exception.details ? { details: exception.details } : {}),
        },
      });
    }

    // Validation errors. Normalize them into our envelope.
    if (exception instanceof HttpException) {
      const payload = exception.getResponse() as string | { message?: unknown };
      const raw = typeof payload === 'string' ? payload : payload.message;
      const message = Array.isArray(raw)
        ? raw.join('; ')
        : String(raw ?? exception.message);
      return response.status(exception.getStatus()).json({
        error: { code: ErrorCodes.VALIDATION_FAILED, message },
      });
    }

    // Unexpected error. Log it for us, give the client a generic message.
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
