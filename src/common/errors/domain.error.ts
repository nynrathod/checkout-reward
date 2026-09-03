import { HttpStatus } from '@nestjs/common';

export class DomainError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'DomainError';
  }

  static badRequest(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    return new DomainError(code, HttpStatus.CONFLICT, message, details);
  }

  static notFound(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    return new DomainError(code, HttpStatus.NOT_FOUND, message, details);
  }

  static conflict(
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    return new DomainError(code, HttpStatus.CONFLICT, message, details);
  }

  static invalid(
    code: string,
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
