import { HttpStatus } from '@nestjs/common';
import type { ErrorCode } from './error-codes.js';

export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  static badRequest(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    return new DomainError(code, HttpStatus.BAD_REQUEST, message, details); // 400
  }

  static notFound(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    return new DomainError(code, HttpStatus.NOT_FOUND, message, details); // 404
  }

  static conflict(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    return new DomainError(code, HttpStatus.CONFLICT, message, details); // 409
  }

  static invalid(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    return new DomainError(
      code,
      HttpStatus.UNPROCESSABLE_ENTITY,
      message,
      details,
    );
  }
}
