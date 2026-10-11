import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApi } from './bootstrap.js';

async function main() {
  const { app, document } = await createApi();
  try {
    await writeFile(
      resolve(import.meta.dirname, '../../../packages/api-client/openapi.json'),
      JSON.stringify(document, null, 2) + '\n',
    );
    console.log('OpenAPI generated offline, without connecting to a database.');
  } finally {
    await app.close();
  }
}
void main().catch(() => {
  console.error('OpenAPI generation failed.');
  process.exitCode = 1;
});
