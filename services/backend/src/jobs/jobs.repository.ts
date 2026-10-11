import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PoolClient } from 'pg';
import { CONFIG, type AppConfig } from '../config.js';
import { Database } from '../db/database.js';

export interface Claim {
  id: string;
  workspaceId: string;
  runId: string;
  fence: number;
  attempt: number;
  maxAttempts: number;
  kind: 'index' | 'question';
  repositoryId: string;
  snapshotId: string | null;
  question: string | null;
}
export class FenceLost extends Error {}
export class Cancelled extends Error {}

export async function appendEvent(
  client: PoolClient,
  workspaceId: string,
  runId: string,
  type: string,
  message: string,
) {
  await client.query(
    'INSERT INTO run_events (workspace_id,run_id,type,message) VALUES ($1,$2,$3,$4)',
    [workspaceId, runId, type, message],
  );
}

@Injectable()
export class JobsRepository {
  constructor(
    private readonly db: Database,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async create(
    workspaceId: string,
    repositoryId: string,
    kind: 'index' | 'question',
    question?: string,
  ) {
    return this.db.transaction(async (client) => {
      // Serializes quota decisions and repository/snapshot selection for this workspace.
      await client.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [
        workspaceId,
      ]);
      const {
        rows: [repository],
      } = await client.query<{ active_snapshot_id: string | null }>(
        'SELECT active_snapshot_id FROM repositories WHERE id=$1 AND workspace_id=$2 FOR UPDATE',
        [repositoryId, workspaceId],
      );
      if (!repository) throw new NotFoundException('Repository not found.');
      if (kind === 'question' && !repository.active_snapshot_id)
        throw new ConflictException(
          'Index the fixture before asking a question.',
        );
      const {
        rows: [quota],
      } = await client.query<{ count: string }>(
        "SELECT count(*) FROM jobs WHERE workspace_id=$1 AND status IN ('pending','processing')",
        [workspaceId],
      );
      if (Number(quota?.count) >= 100)
        throw new ConflictException(
          'Local queue is full. Try again after pending runs finish.',
        );
      let conversationId: string | null = null;
      if (kind === 'question') {
        const {
          rows: [conversation],
        } = await client.query<{ id: string }>(
          'INSERT INTO conversations (workspace_id,repository_id) VALUES ($1,$2) RETURNING id',
          [workspaceId, repositoryId],
        );
        conversationId = conversation!.id;
      }
      const {
        rows: [run],
      } = await client.query<{ id: string }>(
        'INSERT INTO runs (workspace_id,repository_id,conversation_id,snapshot_id,kind,question) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
        [
          workspaceId,
          repositoryId,
          conversationId,
          kind === 'question' ? repository.active_snapshot_id : null,
          kind,
          question ?? null,
        ],
      );
      await client.query(
        'INSERT INTO jobs (workspace_id,run_id) VALUES ($1,$2)',
        [workspaceId, run!.id],
      );
      if (conversationId)
        await client.query(
          "INSERT INTO messages (workspace_id,conversation_id,run_id,role,content) VALUES ($1,$2,$3,'user',$4)",
          [workspaceId, conversationId, run!.id, question],
        );
      await appendEvent(
        client,
        workspaceId,
        run!.id,
        'queued',
        'Run queued for the local worker.',
      );
      return run!.id;
    });
  }

  async recover() {
    await this.db.transaction(async (client) => {
      const { rows } = await client.query<{
        id: string;
        workspace_id: string;
        run_id: string;
        attempt: number;
        max_attempts: number;
      }>(`
        SELECT j.* FROM jobs j
        WHERE j.status='processing' AND j.lease_until <= clock_timestamp()
        ORDER BY j.lease_until FOR UPDATE OF j SKIP LOCKED LIMIT 20`);
      for (const job of rows) {
        const {
          rows: [run],
        } = await client.query<{ cancel_requested: boolean }>(
          'SELECT cancel_requested FROM runs WHERE id=$1 AND workspace_id=$2',
          [job.run_id, job.workspace_id],
        );
        const status = run?.cancel_requested
          ? 'cancelled'
          : job.attempt >= job.max_attempts
            ? 'failed'
            : 'pending';
        const runStatus = status === 'pending' ? 'queued' : status;
        await client.query(
          'UPDATE jobs SET status=$2,fence=fence+1,lease_until=NULL,available_at=clock_timestamp() WHERE id=$1',
          [job.id, status],
        );
        await client.query(
          "UPDATE runs SET status=$2,error=$3,finished_at=CASE WHEN $2='queued' THEN NULL ELSE clock_timestamp() END WHERE id=$1 AND workspace_id=$4",
          [
            job.run_id,
            runStatus,
            status === 'failed'
              ? 'Worker lease expired; maximum attempts reached.'
              : null,
            job.workspace_id,
          ],
        );
        await appendEvent(
          client,
          job.workspace_id,
          job.run_id,
          status === 'pending' ? 'recovered' : status,
          status === 'pending'
            ? 'Expired lease recovered; run will be retried.'
            : `Run ${status} after lease recovery.`,
        );
      }
    });
  }

  async claim(): Promise<Claim | null> {
    return this.db.transaction(async (client) => {
      const {
        rows: [job],
      } = await client.query<Claim>(`
        SELECT j.id, j.workspace_id AS "workspaceId",j.run_id AS "runId",j.fence,j.attempt,j.max_attempts AS "maxAttempts",
          r.kind,r.repository_id AS "repositoryId",r.snapshot_id AS "snapshotId",r.question
        FROM jobs j JOIN runs r ON r.id=j.run_id AND r.workspace_id=j.workspace_id
        WHERE j.status='pending' AND j.available_at <= clock_timestamp() AND j.attempt < j.max_attempts
        ORDER BY j.created_at,j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1`);
      if (!job) return null;
      job.fence += 1;
      job.attempt += 1;
      await client.query(
        "UPDATE jobs SET status='processing',fence=$2,attempt=$3,lease_until=clock_timestamp()+$4::int*interval '1 millisecond' WHERE id=$1",
        [job.id, job.fence, job.attempt, this.config.LEASE_MS],
      );
      await client.query(
        "UPDATE runs SET status='running',error=NULL WHERE id=$1 AND workspace_id=$2",
        [job.runId, job.workspaceId],
      );
      await appendEvent(
        client,
        job.workspaceId,
        job.runId,
        'running',
        `Worker claimed attempt ${job.attempt}.`,
      );
      return job;
    });
  }

  async heartbeat(job: Claim): Promise<'active' | 'cancelled' | 'lost'> {
    const {
      rows: [row],
    } = await this.db.pool.query<{ cancel_requested: boolean }>(
      `
      UPDATE jobs j SET lease_until=clock_timestamp()+$4::int*interval '1 millisecond'
      FROM runs r WHERE j.id=$1 AND j.workspace_id=$2 AND j.fence=$3 AND j.status='processing'
        AND j.lease_until > clock_timestamp() AND r.id=j.run_id AND r.workspace_id=j.workspace_id
      RETURNING r.cancel_requested`,
      [job.id, job.workspaceId, job.fence, this.config.LEASE_MS],
    );
    return !row ? 'lost' : row.cancel_requested ? 'cancelled' : 'active';
  }

  private async leased<T>(
    job: Claim,
    fn: (client: PoolClient, cancel: boolean) => Promise<T>,
  ) {
    return this.db.transaction(async (client) => {
      // Acquire the job lock first, then read cancellation/lease in a fresh statement.
      // A join read before waiting for this lock can see a stale runs row at READ COMMITTED.
      const locked = await client.query(
        'SELECT id FROM jobs WHERE id=$1 AND workspace_id=$2 FOR UPDATE',
        [job.id, job.workspaceId],
      );
      if (!locked.rowCount) throw new FenceLost('Lease lost');
      const {
        rows: [row],
      } = await client.query<{ cancel_requested: boolean }>(
        `SELECT r.cancel_requested FROM jobs j JOIN runs r ON r.id=j.run_id AND r.workspace_id=j.workspace_id
        WHERE j.id=$1 AND j.workspace_id=$2 AND j.fence=$3 AND j.status='processing' AND j.lease_until > clock_timestamp()`,
        [job.id, job.workspaceId, job.fence],
      );
      if (!row) throw new FenceLost('Lease lost');
      return fn(client, row.cancel_requested);
    });
  }

  async event(job: Claim, type: string, message: string) {
    return this.leased(job, async (client, cancel) => {
      if (cancel) throw new Cancelled('Cancellation requested');
      await appendEvent(client, job.workspaceId, job.runId, type, message);
    });
  }

  async complete(
    job: Claim,
    result: unknown,
    persist?: (client: PoolClient) => Promise<unknown>,
  ) {
    return this.leased(job, async (client, cancel) => {
      const status = cancel ? 'cancelled' : 'completed';
      const finalResult = cancel
        ? null
        : persist
          ? await persist(client)
          : result;
      // Final check uses wall clock, not transaction start time. All side effects roll back if expired.
      const updated = await client.query(
        `UPDATE jobs SET status=$4,lease_until=NULL
        WHERE id=$1 AND workspace_id=$2 AND fence=$3 AND lease_until > clock_timestamp() RETURNING id`,
        [job.id, job.workspaceId, job.fence, status],
      );
      if (!updated.rowCount) throw new FenceLost('Lease expired before commit');
      await client.query(
        'UPDATE runs SET status=$3,result=$4,error=NULL,finished_at=clock_timestamp() WHERE id=$1 AND workspace_id=$2',
        [
          job.runId,
          job.workspaceId,
          status,
          finalResult ? JSON.stringify(finalResult) : null,
        ],
      );
      if (!cancel && job.kind === 'question') {
        await client.query(
          `INSERT INTO messages (workspace_id,conversation_id,run_id,role,content)
          SELECT workspace_id,conversation_id,id,'assistant',$3 FROM runs WHERE id=$1 AND workspace_id=$2
          ON CONFLICT (run_id,role) DO NOTHING`,
          [job.runId, job.workspaceId, JSON.stringify(finalResult)],
        );
      }
      await appendEvent(
        client,
        job.workspaceId,
        job.runId,
        status,
        cancel ? 'Run cancelled cooperatively.' : 'Result persisted.',
      );
    });
  }

  async fail(job: Claim) {
    return this.leased(job, async (client, cancel) => {
      const status = cancel
        ? 'cancelled'
        : job.attempt >= job.maxAttempts
          ? 'failed'
          : 'pending';
      const runStatus = status === 'pending' ? 'queued' : status;
      const updated = await client.query(
        "UPDATE jobs SET status=$4,lease_until=NULL,available_at=clock_timestamp()+interval '1 second' WHERE id=$1 AND workspace_id=$2 AND fence=$3 AND lease_until > clock_timestamp() RETURNING id",
        [job.id, job.workspaceId, job.fence, status],
      );
      if (!updated.rowCount)
        throw new FenceLost('Lease expired before failure commit');
      await client.query(
        "UPDATE runs SET status=$3,error=$4,finished_at=CASE WHEN $3='queued' THEN NULL ELSE clock_timestamp() END WHERE id=$1 AND workspace_id=$2",
        [
          job.runId,
          job.workspaceId,
          runStatus,
          status === 'cancelled'
            ? null
            : status === 'failed'
              ? 'Processing failed after maximum attempts. Check local fixture/database availability.'
              : 'Attempt failed; retry scheduled.',
        ],
      );
      await appendEvent(
        client,
        job.workspaceId,
        job.runId,
        status === 'pending' ? 'retrying' : status,
        status === 'pending'
          ? 'Attempt failed; retry scheduled.'
          : `Run ${status}.`,
      );
    });
  }

  async cancel(workspaceId: string, runId: string) {
    await this.db.transaction(async (client) => {
      const {
        rows: [job],
      } = await client.query<{ id: string; status: string }>(
        'SELECT id,status FROM jobs WHERE run_id=$1 AND workspace_id=$2 FOR UPDATE',
        [runId, workspaceId],
      );
      if (!job) throw new NotFoundException('Run not found.');
      if (['completed', 'failed', 'cancelled'].includes(job.status)) return;
      const {
        rows: [run],
      } = await client.query<{ cancel_requested: boolean }>(
        'SELECT cancel_requested FROM runs WHERE id=$1 AND workspace_id=$2',
        [runId, workspaceId],
      );
      if (run?.cancel_requested) return;
      const immediate = job.status === 'pending';
      await client.query(
        "UPDATE runs SET cancel_requested=true,status=CASE WHEN $3 THEN 'cancelled' ELSE status END,finished_at=CASE WHEN $3 THEN clock_timestamp() ELSE NULL END WHERE id=$1 AND workspace_id=$2",
        [runId, workspaceId, immediate],
      );
      if (immediate)
        await client.query(
          "UPDATE jobs SET status='cancelled',fence=fence+1,lease_until=NULL WHERE id=$1",
          [job.id],
        );
      await appendEvent(
        client,
        workspaceId,
        runId,
        immediate ? 'cancelled' : 'cancellation_requested',
        immediate
          ? 'Queued run cancelled.'
          : 'Cancellation requested; waiting for worker checkpoint.',
      );
    });
  }
}
