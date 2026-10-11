import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './process.mjs';

console.log(`Platform: ${process.platform}/${process.arch}`);
console.log(`Runtime: ${process.version}; pinned runtime: 24.21.0`);
let failed = false;
if (process.version !== 'v24.21.0') {
  console.error(
    'Run pnpm install and pnpm run doctor to use the project-local runtime, or install the pinned Node release.',
  );
  failed = true;
}
for (const args of [
  ['--version'],
  ['compose', 'version'],
  ['info', '--format', '{{.ServerVersion}}'],
]) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: 10000,
  });
  if (result.status !== 0) {
    console.error(
      `Docker ${args[0]} unavailable. Install/start Docker Desktop (Windows) or Docker Engine + Compose (Linux).`,
    );
    failed = true;
  } else console.log(result.stdout.trim());
}
console.log(
  `Environment file: ${existsSync(resolve(root, '.env')) ? 'present (contents hidden)' : 'absent; pnpm run setup will copy .env.example'}`,
);
process.exitCode = failed ? 1 : 0;
