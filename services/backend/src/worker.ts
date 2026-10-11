import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './modules.js';

async function main() {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['error', 'warn'],
  });
  app.enableShutdownHooks();
  console.log('RepoPilot standalone worker started (concurrency=1).');
}
void main().catch(() => {
  console.error('Worker startup failed. Verify local demo configuration.');
  process.exitCode = 1;
});
