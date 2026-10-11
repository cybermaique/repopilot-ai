import { resolve } from 'node:path';
import { z } from 'zod';

export const LOCAL_WORKSPACE = '00000000-0000-4000-8000-000000000001';

export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const config = z
    .object({
      NODE_ENV: z
        .enum(['development', 'test', 'production'])
        .default('development'),
      DEV_AUTH: z.enum(['true', 'false']).default('true'),
      DATABASE_URL: z
        .string()
        .url()
        .default(
          'postgresql://repopilot:repopilot_local@127.0.0.1:55432/repopilot',
        ),
      API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
      API_HOST: z.string().default('127.0.0.1'),
      LOCAL_ORIGIN: z.string().url().default('http://localhost:8088'),
      FIXTURE_ROOT: z
        .string()
        .default(resolve(import.meta.dirname, '../../../fixtures/sample-repo')),
      WORKER_POLL_MS: z.coerce.number().int().min(50).max(10000).default(300),
      LEASE_MS: z.coerce.number().int().min(1000).max(120000).default(15000),
    })
    .parse(env);
  if (config.NODE_ENV === 'production' || config.DEV_AUTH !== 'true') {
    throw new Error(
      'Local demo authentication only. Production requires real authentication; startup refused.',
    );
  }
  const origin = new URL(config.LOCAL_ORIGIN);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) {
    throw new Error('Demo origin must be local.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(
      new URL(config.DATABASE_URL).protocol,
    )
  ) {
    throw new Error('DATABASE_URL must use PostgreSQL.');
  }
  return config;
}

export type AppConfig = ReturnType<typeof readConfig>;
export const CONFIG = Symbol('CONFIG');
