import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { root } from './process.mjs';

const require = createRequire(resolve(root, 'apps/web/package.json'));
const children = [];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (process.platform === 'win32')
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    else child.kill('SIGTERM');
  }
}
function start(args, cwd = root, environment = {}) {
  const child = spawn(process.execPath, args, {
    cwd,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...environment,
    },
  });
  children.push(child);
  child.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
    stop();
  });
  child.on('exit', (code) => {
    if (!stopping) {
      process.exitCode = code || 1;
      stop();
    }
  });
}
start(['services/backend/dist/main.js']);
start(['services/backend/dist/worker.js']);
start(
  [
    require.resolve('next/dist/bin/next'),
    'start',
    '-p',
    process.env.WEB_PORT ?? '3100',
    '-H',
    '127.0.0.1',
  ],
  resolve(root, 'apps/web'),
  { NODE_ENV: 'production' },
);
start(['scripts/gateway.mjs']);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
