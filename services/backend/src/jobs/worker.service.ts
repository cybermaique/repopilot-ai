import {
  Inject,
  Injectable,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { CONFIG, type AppConfig } from '../config.js';
import {
  JobsRepository,
  Cancelled,
  FenceLost,
  type Claim,
} from './jobs.repository.js';
import { IndexService } from '../indexing/index.service.js';
import { SearchRepository } from '../search/search.repository.js';
import {
  answerSchema,
  DemoProvider,
  validateReferences,
} from '../providers/demo.provider.js';

@Injectable()
export class WorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private stopping = false;
  private loop?: Promise<void>;
  private current?: AbortController;
  constructor(
    private readonly jobs: JobsRepository,
    private readonly index: IndexService,
    private readonly search: SearchRepository,
    private readonly provider: DemoProvider,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}
  onApplicationBootstrap() {
    this.loop = this.poll();
  }
  async onModuleDestroy() {
    this.stopping = true;
    this.current?.abort(new Error('Worker stopping'));
    await this.loop;
  }
  private async poll() {
    // One concurrent job per worker process. Additional processes claim with SKIP LOCKED.
    while (!this.stopping) {
      try {
        await this.jobs.recover();
        if (this.stopping) break;
        const job = await this.jobs.claim();
        if (job) {
          if (this.stopping) {
            await this.jobs.fail(job);
            break;
          }
          await this.process(job);
          continue;
        }
      } catch {
        console.error(
          'Worker polling failed; check local database availability.',
        );
      }
      await delay(this.config.WORKER_POLL_MS);
    }
  }
  async process(job: Claim) {
    const controller = new AbortController();
    this.current = controller;
    let heartbeatRunning = false;
    const heartbeat = setInterval(
      () => {
        if (heartbeatRunning) return;
        heartbeatRunning = true;
        void this.jobs
          .heartbeat(job)
          .then((state) => {
            if (state === 'lost') controller.abort(new FenceLost('Lease lost'));
            if (state === 'cancelled')
              controller.abort(new Cancelled('Cancellation requested'));
          })
          .catch(() => controller.abort(new FenceLost('Heartbeat failed')))
          .finally(() => {
            heartbeatRunning = false;
          });
      },
      Math.floor(this.config.LEASE_MS / 3),
    );
    try {
      const state = await this.jobs.heartbeat(job);
      if (state === 'lost') throw new FenceLost('Lease lost');
      if (state === 'cancelled') throw new Cancelled('Cancellation requested');
      if (job.kind === 'index') {
        await this.index.process(job, controller.signal);
        return;
      }
      const started = performance.now();
      await this.jobs.event(
        job,
        'retrieving',
        'Searching PostgreSQL full-text and identifier/path matches.',
      );
      const sources = await this.search.search(
        job.workspaceId,
        job.snapshotId!,
        job.question!,
      );
      controller.signal.throwIfAborted();
      await this.jobs.event(
        job,
        'generating',
        `Demo provider received ${sources.length} retrieved excerpts.`,
      );
      const result = this.provider.answer(job.question!, sources);
      validateReferences(result, sources);
      const ids = [
        ...new Set(result.findings.flatMap((finding) => finding.sourceIds)),
      ];
      const resolved = await Promise.all(
        ids.map((id) =>
          this.search.source(job.workspaceId, id, job.snapshotId!),
        ),
      );
      controller.signal.throwIfAborted();
      const answer = answerSchema.parse({
        ...result,
        provider: 'demo',
        sources: resolved,
        durationMs: Math.round(performance.now() - started),
        limitation:
          'Deterministic extractive demonstration. No LLM, embeddings, semantic search, token usage or model costs.',
      });
      await this.jobs.complete(job, answer);
    } catch (error) {
      if (!(error instanceof FenceLost)) {
        try {
          if (error instanceof Cancelled) await this.jobs.complete(job, null);
          else await this.jobs.fail(job);
        } catch (finishError) {
          if (!(finishError instanceof FenceLost))
            console.error(
              'Worker could not persist failure; lease recovery will retry.',
            );
        }
      }
    } finally {
      clearInterval(heartbeat);
      this.current = undefined;
    }
  }
}
