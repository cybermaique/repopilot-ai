import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config.js';
import { JobsRepository, type Claim } from '../jobs/jobs.repository.js';
import { readFixture } from './fixture.js';

@Injectable()
export class IndexService {
  constructor(
    private readonly jobs: JobsRepository,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}
  async process(job: Claim, signal: AbortSignal) {
    await this.jobs.event(
      job,
      'reading_fixture',
      'Reading allowlisted fixture files without executing code.',
    );
    const snapshot = await readFixture(this.config.FIXTURE_ROOT, signal);
    signal.throwIfAborted();
    await this.jobs.event(
      job,
      'indexing',
      `Prepared ${snapshot.files.length} files; activating only after atomic persistence.`,
    );
    await this.jobs.complete(job, null, async (client) => {
      const chunkCount = snapshot.files.reduce(
        (count, file) => count + file.chunks.length,
        0,
      );
      const {
        rows: [inserted],
      } = await client.query<{ id: string }>(
        `
        INSERT INTO snapshots (workspace_id,repository_id,revision,file_count,chunk_count,diagnostics)
        VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (workspace_id,repository_id,revision) DO NOTHING RETURNING id`,
        [
          job.workspaceId,
          job.repositoryId,
          snapshot.revision,
          snapshot.files.length,
          chunkCount,
          JSON.stringify(snapshot.diagnostics),
        ],
      );
      let snapshotId = inserted?.id;
      if (snapshotId) {
        for (const file of snapshot.files) {
          const {
            rows: [saved],
          } = await client.query<{ id: string }>(
            'INSERT INTO files (workspace_id,snapshot_id,path,content,line_count) VALUES ($1,$2,$3,$4,$5) RETURNING id',
            [
              job.workspaceId,
              snapshotId,
              file.path,
              file.content,
              file.lineCount,
            ],
          );
          for (const chunk of file.chunks)
            await client.query(
              'INSERT INTO chunks (workspace_id,snapshot_id,file_id,path,content,start_line,end_line) VALUES ($1,$2,$3,$4,$5,$6,$7)',
              [
                job.workspaceId,
                snapshotId,
                saved!.id,
                file.path,
                chunk.content,
                chunk.startLine,
                chunk.endLine,
              ],
            );
        }
      } else {
        const {
          rows: [existing],
        } = await client.query<{ id: string }>(
          'SELECT id FROM snapshots WHERE workspace_id=$1 AND repository_id=$2 AND revision=$3',
          [job.workspaceId, job.repositoryId, snapshot.revision],
        );
        snapshotId = existing!.id;
      }
      await client.query(
        'UPDATE repositories SET active_snapshot_id=$3 WHERE id=$1 AND workspace_id=$2',
        [job.repositoryId, job.workspaceId, snapshotId],
      );
      return {
        snapshotId,
        revision: snapshot.revision,
        fileCount: snapshot.files.length,
        chunkCount,
        diagnostics: snapshot.diagnostics,
        reused: !inserted,
      };
    });
  }
}
