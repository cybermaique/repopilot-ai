import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { DomainModule } from './modules.js';
import { CONFIG, LOCAL_WORKSPACE, type AppConfig } from './config.js';
import { RepositoryService } from './repositories/repository.service.js';
import { RunsService } from './runs/runs.service.js';
import { JobsRepository } from './jobs/jobs.repository.js';
import { IndexService } from './indexing/index.service.js';
import { SearchRepository } from './search/search.repository.js';
import { DemoProvider, validateReferences } from './providers/demo.provider.js';
import { WorkerService } from './jobs/worker.service.js';

async function main() {
  const app = await NestFactory.createApplicationContext(DomainModule, {
    logger: ['error', 'warn'],
  });
  try {
    const cases = z
      .array(
        z.object({
          id: z.string(),
          question: z.string(),
          evidence: z.enum(['supported', 'insufficient']),
          expectedPaths: z.array(z.string()),
          note: z.string(),
        }),
      )
      .length(12)
      .parse(
        JSON.parse(
          await readFile(
            resolve(import.meta.dirname, '../../../evals/cases.json'),
            'utf8',
          ),
        ),
      );
    const repositories = app.get(RepositoryService);
    const runs = app.get(RunsService);
    const jobs = app.get(JobsRepository);
    const search = app.get(SearchRepository);
    const provider = app.get(DemoProvider);
    const repository = await repositories.register(LOCAL_WORKSPACE);
    const indexRun = await runs.create(LOCAL_WORKSPACE, repository.id, 'index');
    const worker = new WorkerService(
      jobs,
      app.get(IndexService),
      search,
      provider,
      app.get<AppConfig>(CONFIG),
    );
    // Intended for an idle local environment. Work only on the claim returned by the persistent queue.
    for (let count = 0; count < 100; count++) {
      const job = await jobs.claim();
      if (!job) break;
      await worker.process(job);
      if (job.runId === indexRun.id) break;
    }
    if ((await runs.get(LOCAL_WORKSPACE, indexRun.id)).status !== 'completed')
      throw new Error(
        'Evaluation indexing did not complete; stop other workers and rerun.',
      );
    const snapshotId = (
      await repositories.detail(LOCAL_WORKSPACE, repository.id)
    ).activeSnapshotId!;
    let passed = 0;
    for (const item of cases) {
      const retrieved = await search.search(
        LOCAL_WORKSPACE,
        snapshotId,
        item.question,
      );
      const result = provider.answer(item.question, retrieved);
      validateReferences(result, retrieved);
      const ids = [
        ...new Set(result.findings.flatMap((finding) => finding.sourceIds)),
      ];
      const cited = await Promise.all(
        ids.map((id) => search.source(LOCAL_WORKSPACE, id, snapshotId)),
      );
      const ok =
        result.evidence === item.evidence &&
        (item.expectedPaths.length === 0
          ? cited.length === 0
          : cited.some((source) => item.expectedPaths.includes(source.path)));
      if (ok) passed++;
      console.log(
        `${ok ? 'PASS' : 'FAIL'} ${item.id}: evidence=${result.evidence}; cited=${cited.map((source) => source.path).join(',') || 'none'}`,
      );
    }
    console.log(
      `Demo fixture evaluation: ${passed}/${cases.length} cases passed. No LLM metrics.`,
    );
    if (passed !== cases.length) process.exitCode = 1;
  } finally {
    await app.close();
  }
}
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Evaluation failed');
  process.exitCode = 1;
});
