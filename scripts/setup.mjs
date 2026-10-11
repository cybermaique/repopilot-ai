import { copyFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { root, run, pnpm } from './process.mjs';

try {
  try {
    await access(resolve(root, '.env'));
  } catch {
    await copyFile(resolve(root, '.env.example'), resolve(root, '.env'));
  }
  await pnpm(['run', 'doctor']);
  await run('docker', [
    'compose',
    '-f',
    'infra/compose.yaml',
    'up',
    '-d',
    'db',
    '--wait',
  ]);
  await pnpm(['db:migrate']);
  await pnpm(['seed']);
  console.log(
    'Local setup ready. Run pnpm dev and open http://localhost:8088.',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
