import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createApi } from '../src/bootstrap.js';
import { CONFIG, LOCAL_WORKSPACE, type AppConfig } from '../src/config.js';
import { Database } from '../src/db/database.js';
import { RepositoryService } from '../src/repositories/repository.service.js';
import { JobsRepository, FenceLost } from '../src/jobs/jobs.repository.js';
import { RunsService } from '../src/runs/runs.service.js';
import { IndexService } from '../src/indexing/index.service.js';
import { SearchRepository } from '../src/search/search.repository.js';
import { DemoProvider } from '../src/providers/demo.provider.js';
import { WorkerService } from '../src/jobs/worker.service.js';
import type { components } from '../../../packages/api-client/src/schema.js';

let app: INestApplication;
let db: Database;
let repositories: RepositoryService;
let jobs: JobsRepository;
let runs: RunsService;
let search: SearchRepository;
let worker: WorkerService;
let config: AppConfig;
let repositoryId: string;

beforeAll(async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || new URL(url).pathname !== '/repopilot_test')
    throw new Error(
      'TEST_DATABASE_URL must point to the dedicated repopilot_test database. No other database is modified.',
    );
  process.env.NODE_ENV = 'test';
  process.env.DEV_AUTH = 'true';
  process.env.DATABASE_URL = url;
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: resolve(import.meta.dirname, '../drizzle'),
    });
  } finally {
    await pool.end();
  }
  ({ app } = await createApi());
  await app.init();
  db = app.get(Database);
  repositories = app.get(RepositoryService);
  jobs = app.get(JobsRepository);
  runs = app.get(RunsService);
  search = app.get(SearchRepository);
  config = app.get(CONFIG);
  worker = new WorkerService(
    jobs,
    app.get(IndexService),
    search,
    app.get(DemoProvider),
    config,
  );
});
beforeEach(async () => {
  await db.pool.query(
    'TRUNCATE workspaces,repositories,snapshots,files,chunks,conversations,messages,runs,jobs,run_events RESTART IDENTITY CASCADE',
  );
  repositoryId = (await repositories.register(LOCAL_WORKSPACE)).id;
});
afterAll(async () => {
  if (app) await app.close();
});

async function processRun(kind: 'index' | 'question', question?: string) {
  const run = await runs.create(LOCAL_WORKSPACE, repositoryId, kind, question);
  const job = await jobs.claim();
  expect(job?.runId).toBe(run.id);
  await worker.process(job!);
  return runs.get(LOCAL_WORKSPACE, run.id);
}
async function indexFixture() {
  const run = await processRun('index');
  expect(run.status).toBe('completed');
  return (await repositories.detail(LOCAL_WORKSPACE, repositoryId))
    .activeSnapshotId!;
}

describe('PostgreSQL-backed phase 1', () => {
  test('completion waiting for a lock observes cancellation committed by its owner', async () => {
    const run = await runs.create(LOCAL_WORKSPACE, repositoryId, 'index');
    const job = (await jobs.claim())!;
    const blocker = await db.pool.connect();
    let completion: Promise<void> | undefined;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM jobs WHERE id=$1 FOR UPDATE', [
        job.id,
      ]);
      completion = jobs.complete(job, { shouldNotPersist: true });
      let waiting = false;
      for (let count = 0; count < 100; count++) {
        const {
          rows: [activity],
        } = await db.pool.query<{ waiting: boolean }>(
          "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT id FROM jobs WHERE id=%') AS waiting",
        );
        if (activity?.waiting) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(waiting).toBe(true);
      await blocker.query(
        'UPDATE runs SET cancel_requested=true WHERE id=$1 AND workspace_id=$2',
        [run.id, LOCAL_WORKSPACE],
      );
      await blocker.query('COMMIT');
      await completion;
      expect((await runs.get(LOCAL_WORKSPACE, run.id)).status).toBe(
        'cancelled',
      );
      expect((await runs.get(LOCAL_WORKSPACE, run.id)).indexResult).toBeNull();
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await completion;
    }
  });
  test('foreign workspace IDs cannot be read over HTTP or SSE, even with spoofed headers', async () => {
    const foreignWorkspace = randomUUID();
    const foreignRepository = randomUUID();
    await db.pool.query(
      "INSERT INTO workspaces (id,name) VALUES ($1,'Other workspace')",
      [foreignWorkspace],
    );
    await db.pool.query(
      "INSERT INTO repositories (id,workspace_id,name) VALUES ($1,$2,'Private fixture')",
      [foreignRepository, foreignWorkspace],
    );
    const foreignRun = await runs.create(
      foreignWorkspace,
      foreignRepository,
      'index',
    );
    await worker.process((await jobs.claim())!);
    const snapshotId = (
      await repositories.detail(foreignWorkspace, foreignRepository)
    ).activeSnapshotId!;
    const [foreignSource] = await search.search(
      foreignWorkspace,
      snapshotId,
      'isTokenExpired',
    );
    for (const path of [
      `/api/repositories/${foreignRepository}`,
      `/api/runs/${foreignRun.id}`,
      `/api/runs/${foreignRun.id}/events`,
      `/api/runs/${foreignRun.id}/stream`,
      `/api/sources/${foreignSource!.sourceId}`,
    ]) {
      await request(app.getHttpServer())
        .get(path)
        .set('X-Workspace-Id', foreignWorkspace)
        .expect(404);
    }
    await request(app.getHttpServer())
      .post(`/api/runs/${foreignRun.id}/cancel`)
      .expect(404);
    await request(app.getHttpServer())
      .post(`/api/repositories/${foreignRepository}/index`)
      .expect(404);
  });
  test('idempotent atomic indexing, immutable source data and source line resolution', async () => {
    const snapshotId = await indexFixture();
    const second = await processRun('index');
    expect(second.indexResult).toMatchObject({ snapshotId, reused: true });
    const detail = await repositories.detail(LOCAL_WORKSPACE, repositoryId);
    expect(detail.snapshots).toHaveLength(1);
    const sources = await search.search(
      LOCAL_WORKSPACE,
      snapshotId,
      'isTokenExpired',
    );
    expect(sources.length).toBeGreaterThan(0);
    const source = await search.source(
      LOCAL_WORKSPACE,
      sources[0]!.sourceId,
      snapshotId,
    );
    const {
      rows: [file],
    } = await db.pool.query<{ content: string }>(
      'SELECT content FROM files WHERE workspace_id=$1 AND snapshot_id=$2 AND path=$3',
      [LOCAL_WORKSPACE, snapshotId, source.path],
    );
    expect(
      file!.content
        .split('\n')
        .slice(source.startLine - 1, source.endLine)
        .join('\n'),
    ).toBe(source.content);
    await expect(
      db.pool.query("UPDATE chunks SET content='tampered' WHERE id=$1", [
        source.sourceId,
      ]),
    ).rejects.toThrow('immutable');
  });
  test('lexical search handles paths and identifier fragments; no evidence abstains', async () => {
    const snapshotId = await indexFixture();
    expect(
      (await search.search(LOCAL_WORKSPACE, snapshotId, 'src/retry.ts'))[0]
        ?.path,
    ).toBe('src/retry.ts');
    expect(
      (await search.search(LOCAL_WORKSPACE, snapshotId, 'renewSession')).map(
        (source) => source.path,
      ),
    ).toContain('src/session.ts');
    const run = await processRun(
      'question',
      'Where is isTokenExpired defined?',
    );
    expect(run.answer?.provider).toBe('demo');
    expect(run.answer?.sources.length).toBeGreaterThan(0);
    const unknown = await processRun(
      'question',
      'How does the lunar telemetry protocol work?',
    );
    expect(unknown.answer?.evidence).toBe('insufficient');
    expect(unknown.answer?.sources).toEqual([]);
  });
  test('every read/write is scoped, including foreign sources, history, events and cancel', async () => {
    const snapshotId = await indexFixture();
    const run = await processRun('question', 'renewSession');
    const other = randomUUID();
    expect(await repositories.list(other)).toEqual([]);
    await expect(repositories.detail(other, repositoryId)).rejects.toThrow(
      'not found',
    );
    expect(await search.search(other, snapshotId, 'renewSession')).toEqual([]);
    await expect(
      search.source(other, run.answer!.sources[0]!.sourceId),
    ).rejects.toThrow('not found');
    await expect(
      search.source(
        LOCAL_WORKSPACE,
        run.answer!.sources[0]!.sourceId,
        randomUUID(),
      ),
    ).rejects.toThrow('not found');
    expect(await runs.history(other)).toEqual([]);
    await expect(runs.events(other, run.id, 0)).rejects.toThrow('not found');
    await expect(runs.cancel(other, run.id)).rejects.toThrow('not found');
    await expect(runs.create(other, repositoryId, 'index')).rejects.toThrow(
      'not found',
    );
  });
  test('SKIP LOCKED lets concurrent workers claim different jobs; run/job creation is atomic', async () => {
    const first = await runs.create(LOCAL_WORKSPACE, repositoryId, 'index');
    const second = await runs.create(LOCAL_WORKSPACE, repositoryId, 'index');
    const blocker = await db.pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT id FROM jobs WHERE run_id=$1 FOR UPDATE', [
        first.id,
      ]);
      expect((await jobs.claim())?.runId).toBe(second.id);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
    }
    expect((await jobs.claim())?.runId).toBe(first.id);
    await expect(
      runs.create(LOCAL_WORKSPACE, randomUUID(), 'index'),
    ).rejects.toThrow();
    const {
      rows: [counts],
    } = await db.pool.query<{ runs: string; jobs: string }>(
      'SELECT (SELECT count(*) FROM runs) AS runs,(SELECT count(*) FROM jobs) AS jobs',
    );
    expect(counts).toEqual({ runs: '2', jobs: '2' });
  });
  test('expired leases recover and stale fencing tokens cannot complete or heartbeat', async () => {
    const run = await runs.create(LOCAL_WORKSPACE, repositoryId, 'index');
    const stale = (await jobs.claim())!;
    await db.pool.query(
      "UPDATE jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
      [stale.id],
    );
    expect(await jobs.heartbeat(stale)).toBe('lost');
    await jobs.recover();
    const current = (await jobs.claim())!;
    expect(current.fence).toBeGreaterThan(stale.fence);
    await expect(jobs.complete(stale, { stale: true })).rejects.toBeInstanceOf(
      FenceLost,
    );
    await worker.process(current);
    expect((await runs.get(LOCAL_WORKSPACE, run.id)).status).toBe('completed');
    await expect(
      jobs.complete(current, { duplicate: true }),
    ).rejects.toBeInstanceOf(FenceLost);
  });
  test('bounded attempts end abandoned jobs in failure', async () => {
    const run = await runs.create(LOCAL_WORKSPACE, repositoryId, 'index');
    for (let attempt = 0; attempt < 3; attempt++) {
      const job = (await jobs.claim())!;
      await db.pool.query(
        "UPDATE jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE id=$1",
        [job.id],
      );
      await jobs.recover();
    }
    expect((await runs.get(LOCAL_WORKSPACE, run.id)).status).toBe('failed');
    expect(await jobs.claim()).toBeNull();
  });
  test('lease expiration during atomic persistence rolls back all side effects', async () => {
    await runs.create(LOCAL_WORKSPACE, repositoryId, 'index');
    const job = (await jobs.claim())!;
    await db.pool.query(
      "UPDATE jobs SET lease_until=clock_timestamp()+interval '100 milliseconds' WHERE id=$1",
      [job.id],
    );
    await expect(
      jobs.complete(job, null, async (client) => {
        await client.query(
          "INSERT INTO workspaces (id,name) VALUES ($1,'must rollback')",
          [randomUUID()],
        );
        await client.query('SELECT pg_sleep(0.2)');
        return { saved: true };
      }),
    ).rejects.toBeInstanceOf(FenceLost);
    expect(
      (await db.pool.query('SELECT count(*) FROM workspaces')).rows[0],
    ).toEqual({ count: '1' });
  });
  test('queued/running cancellation is cooperative, idempotent and cannot activate a snapshot', async () => {
    const queued = await runs.create(LOCAL_WORKSPACE, repositoryId, 'index');
    await runs.cancel(LOCAL_WORKSPACE, queued.id);
    await runs.cancel(LOCAL_WORKSPACE, queued.id);
    expect((await runs.get(LOCAL_WORKSPACE, queued.id)).status).toBe(
      'cancelled',
    );
    expect(await jobs.claim()).toBeNull();
    const running = await runs.create(LOCAL_WORKSPACE, repositoryId, 'index');
    const job = (await jobs.claim())!;
    await runs.cancel(LOCAL_WORKSPACE, running.id);
    expect(await jobs.heartbeat(job)).toBe('cancelled');
    await worker.process(job);
    expect((await runs.get(LOCAL_WORKSPACE, running.id)).status).toBe(
      'cancelled',
    );
    expect(
      (await repositories.detail(LOCAL_WORKSPACE, repositoryId))
        .activeSnapshotId,
    ).toBeNull();
    expect(
      (await runs.events(LOCAL_WORKSPACE, queued.id, 0)).filter(
        (event) => event.type === 'cancelled',
      ),
    ).toHaveLength(1);
  });
  test('failed indexing preserves the active snapshot and exposes diagnostics', async () => {
    const snapshotId = await indexFixture();
    const saved = config.FIXTURE_ROOT;
    config.FIXTURE_ROOT = resolve(import.meta.dirname, 'nonexistent-fixture');
    try {
      const run = await runs.create(LOCAL_WORKSPACE, repositoryId, 'index');
      const job = (await jobs.claim())!;
      await db.pool.query('UPDATE jobs SET attempt=max_attempts WHERE id=$1', [
        job.id,
      ]);
      job.attempt = job.maxAttempts;
      await worker.process(job);
      expect((await runs.get(LOCAL_WORKSPACE, run.id)).status).toBe('failed');
      expect(
        (await repositories.detail(LOCAL_WORKSPACE, repositoryId))
          .activeSnapshotId,
      ).toBe(snapshotId);
    } finally {
      config.FIXTURE_ROOT = saved;
    }
  });
  test('HTTP validation, generated contract, scope spoofing and health checks', async () => {
    await request(app.getHttpServer()).get('/api/health/ready').expect(200);
    await request(app.getHttpServer())
      .post('/api/runs')
      .send({ repositoryId, question: 'x', workspaceId: randomUUID() })
      .expect(400)
      .expect((response) =>
        expect(response.body.message).toContain('workspaceId'),
      );
    await request(app.getHttpServer())
      .post('/api/repositories')
      .set('Origin', 'https://foreign.invalid')
      .send({ kind: 'fixture' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/runs')
      .send({ repositoryId, question: 'isTokenExpired' })
      .expect(409);
    await indexFixture();
    const response = await request(app.getHttpServer())
      .post('/api/runs')
      .send({ repositoryId, question: 'isTokenExpired' })
      .expect(201);
    const created: components['schemas']['RunDto'] = response.body;
    expect(created.status).toBe('queued');
    expect(created.repositoryId).toBe(repositoryId);
    await worker.process((await jobs.claim())!);
    await request(app.getHttpServer())
      .get(`/api/runs/${created.id}`)
      .set('X-Workspace-Id', randomUUID())
      .expect(200)
      .expect((result) => expect(result.body.answer.provider).toBe('demo'));
    await request(app.getHttpServer())
      .get(`/api/runs/${created.id}/events?after=-1`)
      .expect(400);
    await request(app.getHttpServer())
      .get('/api/repositories/not-a-uuid')
      .expect(400);
  });
  test('SSE replays persistent sequence after a cursor without cancellation on disconnect', async () => {
    await indexFixture();
    const run = await processRun('question', 'renewSession');
    const events = await runs.events(LOCAL_WORKSPACE, run.id, 0);
    const cursor = events[1]!.sequence;
    const result = await request(app.getHttpServer())
      .get(`/api/runs/${run.id}/stream`)
      .set('Last-Event-ID', String(cursor))
      .expect(200);
    const ids = [...result.text.matchAll(/^id: (\d+)/gm)].map((match) =>
      Number(match[1]),
    );
    expect(ids).toEqual(
      events
        .filter((event) => event.sequence > cursor)
        .map((event) => event.sequence),
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect((await runs.get(LOCAL_WORKSPACE, run.id)).status).toBe('completed');
  });
  test('result, messages and history survive a fresh Nest application instance', async () => {
    await indexFixture();
    const run = await processRun('question', 'isTokenExpired');
    const fresh = await createApi();
    try {
      await fresh.app.init();
      expect(
        (await fresh.app.get(RunsService).get(LOCAL_WORKSPACE, run.id)).answer,
      ).toEqual(run.answer);
      expect(
        (await fresh.app.get(RunsService).history(LOCAL_WORKSPACE)).map(
          (item) => item.id,
        ),
      ).toContain(run.id);
      const { rows } = await fresh.app
        .get(Database)
        .pool.query('SELECT role FROM messages WHERE run_id=$1 ORDER BY role', [
          run.id,
        ]);
      expect(rows).toEqual([{ role: 'assistant' }, { role: 'user' }]);
    } finally {
      await fresh.app.close();
    }
  });
});
