import { resolve } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readConfig } from '../config.js';

async function main() {
  const config = readConfig();
  const pool = new Pool({ connectionString: config.DATABASE_URL });
  const client = await pool.connect();
  try {
    // Dedicated process + session lock prevents concurrent migration commands.
    await client.query('SELECT pg_advisory_lock(714901)');
    await migrate(drizzle(client), {
      migrationsFolder: resolve(import.meta.dirname, '../../drizzle'),
    });
    console.log('Migrations applied.');
  } finally {
    await client.query('SELECT pg_advisory_unlock(714901)');
    client.release();
    await pool.end();
  }
}
void main().catch(() => {
  console.error(
    'Migration failed. Check database connectivity and migration SQL.',
  );
  process.exitCode = 1;
});
