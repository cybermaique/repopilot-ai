import { createApi } from './bootstrap.js';
import { CONFIG, type AppConfig } from './config.js';

async function main() {
  const { app } = await createApi();
  const config = app.get<AppConfig>(CONFIG);
  app.enableShutdownHooks();
  await app.listen(config.API_PORT, config.API_HOST);
  console.log(
    `RepoPilot API listening on ${config.API_HOST}:${config.API_PORT} (local demo identity).`,
  );
}
void main().catch(() => {
  console.error('API startup failed. Verify local demo configuration.');
  process.exitCode = 1;
});
