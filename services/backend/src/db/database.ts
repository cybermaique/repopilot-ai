import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, PoolClient } from 'pg';
import { CONFIG, type AppConfig } from '../config.js';
import * as schema from './schema.js';

@Injectable()
export class Database implements OnApplicationShutdown {
  readonly pool: Pool;
  readonly orm;
  constructor(@Inject(CONFIG) config: AppConfig) {
    this.pool = new Pool({
      connectionString: config.DATABASE_URL,
      max: 8,
      connectionTimeoutMillis: 3000,
      statement_timeout: 10000,
    });
    this.pool.on('error', () =>
      console.error('Database idle connection failed.'),
    );
    this.orm = drizzle(this.pool, { schema });
  }
  async transaction<T>(fn: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  // Workers/controllers finish their onModuleDestroy hooks before the pool closes.
  async onApplicationShutdown() {
    await this.pool.end();
  }
}
