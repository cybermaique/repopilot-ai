import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { root } from './process.mjs';

const require = createRequire(resolve(root, 'services/backend/package.json'));
const { Pool } = require('pg');
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || new URL(testUrl).pathname !== '/repopilot_test')
  throw new Error('TEST_DATABASE_URL must target repopilot_test.');
const admin = new URL(testUrl);
admin.pathname = '/postgres';
const pool = new Pool({ connectionString: admin.toString() });
try {
  const existing = await pool.query(
    'SELECT 1 FROM pg_database WHERE datname=$1',
    ['repopilot_test'],
  );
  if (!existing.rowCount) await pool.query('CREATE DATABASE repopilot_test');
  console.log('Dedicated repopilot_test database exists.');
} finally {
  await pool.end();
}
