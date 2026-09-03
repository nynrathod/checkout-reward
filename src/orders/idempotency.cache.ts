import { Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/domain.error.js';
import { ErrorCode } from '../common/errors/error-codes.js';

interface CachedFailure {
  code: ErrorCode;
  status: number;
  message: string;
  details?: Record<string, unknown>;
  expiresAt: number;
}

@Injectable()
export class IdempotencyCache {
  // Keep failures for 5 minutes. Stops clients from hammering us on broken carts.
  private readonly ttlMs = 5 * 60 * 1000;
  private readonly cache = new Map<string, CachedFailure>();

  getFailed(key: string): CachedFailure | undefined {
    const hit = this.cache.get(key);
    if (!hit) return undefined;

    // Expired? Delete it and pretend we never saw it.
    if (Date.now() > hit.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return hit;
  }

  setFailed(key: string, error: DomainError): void {
    this.cache.set(key, {
      code: error.code,
      status: error.status,
      message: error.message,
      details: error.details,
      expiresAt: Date.now() + this.ttlMs,
    });
  }
}
