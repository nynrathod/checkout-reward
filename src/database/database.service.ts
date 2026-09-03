import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { SCHEMA_SQL, SEED_PRODUCTS } from './schema.js';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private db!: Database.Database;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  onModuleInit(): void {
    const path = this.config.get('databasePath', { infer: true });
    if (path !== ':memory:') {
      mkdirSync(dirname(path), { recursive: true });
    }
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(SCHEMA_SQL);
    this.seed();
  }

  private seed(): void {
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO products (id, name, price_cents, inventory) VALUES (@id, @name, @priceCents, @inventory)',
    );
    for (const product of SEED_PRODUCTS) stmt.run(product);
  }

  get connection(): Database.Database {
    return this.db;
  }

  // Runs `fn` as one atomic unit: any throw rolls everything back.
  // better-sqlite3 is synchronous on a single connection, so nothing can
  // interleave with `fn` inside this process. The SQL-level guards
  // (conditional updates, unique constraints) remain the real invariant
  // enforcers for the multi-instance case.
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
