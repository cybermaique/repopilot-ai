import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { root, pnpm } from './process.mjs';

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
function start(args, cwd = root) {
  const child = spawn(process.execPath, args, { cwd, stdio: 'inherit' });
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
try {
  await pnpm(['--filter', '@repopilot/backend', 'build']);
  const backend = resolve(root, 'services/backend');
  start(
    [
      resolve(root, 'node_modules/typescript/bin/tsc'),
      '-p',
      'tsconfig.build.json',
      '--watch',
    ],
    backend,
  );
  start([
    '--env-file-if-exists=.env',
    '--watch',
    'services/backend/dist/main.js',
  ]);
  start([
    '--env-file-if-exists=.env',
    '--watch',
    'services/backend/dist/worker.js',
  ]);
  start(
    [
      require.resolve('next/dist/bin/next'),
      'dev',
      '-p',
      process.env.WEB_PORT ?? '3100',
      '-H',
      '127.0.0.1',
    ],
    resolve(root, 'apps/web'),
  );
  start(['--env-file-if-exists=.env', 'scripts/gateway.mjs']);
  console.log(
    'Open http://localhost:8088. Ctrl+C stops only processes spawned by this command.',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  stop();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, stop);
