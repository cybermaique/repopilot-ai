import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DomainModule } from './modules.js';
import { LOCAL_WORKSPACE } from './config.js';
import { RepositoryService } from './repositories/repository.service.js';

async function main() {
  const app = await NestFactory.createApplicationContext(DomainModule, {
    logger: ['error', 'warn'],
  });
  try {
    const repository = await app
      .get(RepositoryService)
      .register(LOCAL_WORKSPACE);
    console.log(
      `Registered fixture repository: ${repository.id}. Index using the UI or API.`,
    );
  } finally {
    await app.close();
  }
}
void main().catch(() => {
  console.error('Seed failed. Check database/migrations.');
  process.exitCode = 1;
});
