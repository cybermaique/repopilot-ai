import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gt, asc } from 'drizzle-orm';
import { Database } from '../db/database.js';
import { runs, runEvents } from '../db/schema.js';
import { JobsRepository } from '../jobs/jobs.repository.js';
import { answerSchema } from '../providers/demo.provider.js';

@Injectable()
export class RunsService {
  constructor(
    private readonly db: Database,
    private readonly jobs: JobsRepository,
  ) {}
  async get(workspaceId: string, id: string) {
    const [run] = await this.db.orm
      .select()
      .from(runs)
      .where(and(eq(runs.id, id), eq(runs.workspaceId, workspaceId)));
    if (!run) throw new NotFoundException('Run not found.');
    return {
      id: run.id,
      repositoryId: run.repositoryId,
      snapshotId: run.snapshotId,
      conversationId: run.conversationId,
      kind: run.kind,
      question: run.question,
      status: run.status,
      cancelRequested: run.cancelRequested,
      answer:
        run.kind === 'question' && run.result
          ? answerSchema.parse(run.result)
          : null,
      indexResult: run.kind === 'index' ? run.result : null,
      error: run.error,
      createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  }
  async history(workspaceId: string, repositoryId?: string) {
    const rows = await this.db.orm
      .select({ id: runs.id })
      .from(runs)
      .where(
        and(
          eq(runs.workspaceId, workspaceId),
          repositoryId ? eq(runs.repositoryId, repositoryId) : undefined,
        ),
      )
      .orderBy(desc(runs.createdAt), desc(runs.id))
      .limit(50);
    return Promise.all(rows.map((row) => this.get(workspaceId, row.id)));
  }
  async create(
    workspaceId: string,
    repositoryId: string,
    kind: 'index' | 'question',
    question?: string,
  ) {
    return this.get(
      workspaceId,
      await this.jobs.create(workspaceId, repositoryId, kind, question),
    );
  }
  async cancel(workspaceId: string, id: string) {
    await this.jobs.cancel(workspaceId, id);
    return this.get(workspaceId, id);
  }
  async events(workspaceId: string, id: string, after: number) {
    await this.get(workspaceId, id);
    const rows = await this.db.orm
      .select()
      .from(runEvents)
      .where(
        and(
          eq(runEvents.workspaceId, workspaceId),
          eq(runEvents.runId, id),
          gt(runEvents.sequence, after),
        ),
      )
      .orderBy(asc(runEvents.sequence))
      .limit(100);
    return rows.map((event) => ({
      sequence: event.sequence,
      type: event.type,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
    }));
  }
}
