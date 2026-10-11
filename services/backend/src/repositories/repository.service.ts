import { Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { Database } from '../db/database.js';
import { repositories, snapshots, workspaces, runs } from '../db/schema.js';
import { LOCAL_WORKSPACE } from '../config.js';

@Injectable()
export class RepositoryService {
  constructor(private readonly db: Database) {}
  async register(workspaceId: string) {
    // Only the explicit local identity can register the fixed, server-owned fixture.
    if (workspaceId !== LOCAL_WORKSPACE)
      throw new NotFoundException('Workspace not found.');
    await this.db.orm
      .insert(workspaces)
      .values({ id: workspaceId, name: 'Local demo workspace' })
      .onConflictDoNothing();
    const rows = await this.db.orm
      .insert(repositories)
      .values({ workspaceId, name: 'sample-session-client', kind: 'fixture' })
      .onConflictDoUpdate({
        target: [repositories.workspaceId, repositories.name],
        set: { name: 'sample-session-client' },
      })
      .returning();
    return rows[0]!;
  }
  list(workspaceId: string) {
    return this.db.orm
      .select()
      .from(repositories)
      .where(eq(repositories.workspaceId, workspaceId))
      .orderBy(repositories.createdAt);
  }
  async detail(workspaceId: string, id: string) {
    const [repository] = await this.db.orm
      .select()
      .from(repositories)
      .where(
        and(eq(repositories.id, id), eq(repositories.workspaceId, workspaceId)),
      );
    if (!repository) throw new NotFoundException('Repository not found.');
    const revisions = await this.db.orm
      .select()
      .from(snapshots)
      .where(
        and(
          eq(snapshots.repositoryId, id),
          eq(snapshots.workspaceId, workspaceId),
        ),
      )
      .orderBy(desc(snapshots.createdAt));
    const [lastIndexRun] = await this.db.orm
      .select({ id: runs.id, status: runs.status, error: runs.error })
      .from(runs)
      .where(
        and(
          eq(runs.repositoryId, id),
          eq(runs.workspaceId, workspaceId),
          eq(runs.kind, 'index'),
        ),
      )
      .orderBy(desc(runs.createdAt))
      .limit(1);
    return {
      ...repository,
      snapshots: revisions,
      lastIndexRun: lastIndexRun ?? null,
    };
  }
}
