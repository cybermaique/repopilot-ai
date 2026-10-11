import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from './process.mjs';

const require = createRequire(resolve(root, 'apps/web/package.json'));
const cli = require.resolve('next/dist/bin/next');
process.argv = [
  process.execPath,
  cli,
  'start',
  resolve(root, 'apps/web'),
  '-p',
  process.env.WEB_PORT ?? '3100',
  '-H',
  '0.0.0.0',
];
await import(pathToFileURL(cli).href);
