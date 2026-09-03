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
    // WAL lets readers and writers work at the same time.
    // busy_timeout makes SQLite wait 5s instead of crashing on a locked DB.
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.exec(SCHEMA_SQL);
    this.seed();
  }

  private seed(): void {
    // INSERT OR IGNORE means re-running the app won't duplicate seed data.
    const stmt = this.db.prepare(
      'INSERT OR IGNORE INTO products (id, name, price_cents, inventory) VALUES (@id, @name, @priceCents, @inventory)',
    );
    for (const product of SEED_PRODUCTS) stmt.run(product);
  }

  get connection(): Database.Database {
    return this.db;
  }

  // Runs everything as one unit. If it throws, it rolls back.
  // better-sqlite3 is synchronous, so nothing interrupts it inside this process.
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
