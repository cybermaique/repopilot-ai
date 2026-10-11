import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CONFIG, readConfig } from './config.js';
import { Database } from './db/database.js';
import { RepositoryService } from './repositories/repository.service.js';
import { RunsService } from './runs/runs.service.js';
import { SearchRepository } from './search/search.repository.js';
import { DemoProvider } from './providers/demo.provider.js';
import { JobsRepository } from './jobs/jobs.repository.js';
import { IndexService } from './indexing/index.service.js';
import { WorkerService } from './jobs/worker.service.js';
import {
  HealthController,
  RepositoriesController,
  RunsController,
  SourcesController,
} from './http/controllers.js';
import { LocalIdentityGuard } from './http/security.js';

const providers = [
  Database,
  RepositoryService,
  RunsService,
  SearchRepository,
  DemoProvider,
  JobsRepository,
  IndexService,
];
@Module({
  providers: [
    { provide: CONFIG, useFactory: () => readConfig() },
    ...providers,
  ],
  exports: [CONFIG, ...providers],
})
export class DomainModule {}
@Module({
  imports: [DomainModule],
  controllers: [
    HealthController,
    RepositoriesController,
    RunsController,
    SourcesController,
  ],
  providers: [{ provide: APP_GUARD, useClass: LocalIdentityGuard }],
})
export class ApiModule {}
@Module({ imports: [DomainModule], providers: [WorkerService] })
export class WorkerModule {}
