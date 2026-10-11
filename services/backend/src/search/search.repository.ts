import { Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { Database } from '../db/database.js';

export const sourceSchema = z.object({
  sourceId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  path: z.string(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  content: z.string(),
});
export type Source = z.infer<typeof sourceSchema>;
const stopwords = new Set(
  'a an and are as at be by can code do does explain for from how i in is it me of on or please show tell that the this to what where which why with would'.split(
    ' ',
  ),
);

export function lexicalTerms(question: string): string[] {
  const separated = question
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
  const originals = question.toLowerCase().match(/[a-z0-9_./-]+/g) ?? [];
  const split = separated.match(/[a-z0-9]+/g) ?? [];
  return [
    ...new Set(
      [...originals, ...split].filter(
        (term) => term.length > 1 && !stopwords.has(term),
      ),
    ),
  ].slice(0, 32);
}

@Injectable()
export class SearchRepository {
  constructor(private readonly db: Database) {}
  async search(
    workspaceId: string,
    snapshotId: string,
    question: string,
  ): Promise<Source[]> {
    const terms = lexicalTerms(question);
    if (!terms.length) return [];
    const query = terms.filter((term) => /^[a-z0-9]+$/.test(term)).join(' | ');
    const result = await this.db.pool.query<Source>(
      `
      SELECT c.id AS "sourceId", c.snapshot_id AS "snapshotId", c.path, s.revision,
        c.start_line AS "startLine", c.end_line AS "endLine", c.content
      FROM chunks c JOIN snapshots s ON s.id=c.snapshot_id AND s.workspace_id=c.workspace_id
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (WHERE position(term in lower(c.content || ' ' || c.path)) > 0) AS matches,
          count(*) FILTER (WHERE position(term in lower(c.path)) > 0) AS path_matches
        FROM unnest($3::text[]) AS term
      ) matched
      WHERE c.workspace_id=$1 AND c.snapshot_id=$2 AND
        (c.search_vector @@ to_tsquery('simple', $4) OR matched.matches > 0)
      ORDER BY matched.matches DESC, matched.path_matches DESC,
        ts_rank_cd(c.search_vector, to_tsquery('simple', $4)) DESC, c.path, c.start_line
      LIMIT 5`,
      [workspaceId, snapshotId, terms, query || 'zznoqueryzz'],
    );
    return result.rows.map((row) => sourceSchema.parse(row));
  }
  async source(
    workspaceId: string,
    sourceId: string,
    snapshotId?: string,
  ): Promise<Source> {
    const result = await this.db.pool.query<Source>(
      `
      SELECT c.id AS "sourceId", c.snapshot_id AS "snapshotId", c.path, s.revision,
        c.start_line AS "startLine", c.end_line AS "endLine", c.content
      FROM chunks c JOIN files f ON f.id=c.file_id AND f.workspace_id=c.workspace_id AND f.snapshot_id=c.snapshot_id
      JOIN snapshots s ON s.id=c.snapshot_id AND s.workspace_id=c.workspace_id
      WHERE c.id=$1 AND c.workspace_id=$2 AND ($3::uuid IS NULL OR c.snapshot_id=$3)
        AND c.path=f.path AND c.start_line > 0 AND c.end_line <= f.line_count`,
      [sourceId, workspaceId, snapshotId ?? null],
    );
    const source = result.rows[0];
    if (!source)
      throw new NotFoundException(
        'Source not found in this workspace/snapshot.',
      );
    return sourceSchema.parse(source);
  }
}
