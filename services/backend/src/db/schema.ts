import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  unique,
  index,
  foreignKey,
  bigserial,
  check,
} from 'drizzle-orm/pg-core';

const time = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();
const identity = () => uuid('id').primaryKey().defaultRandom();

export const workspaces = pgTable('workspaces', {
  id: identity(),
  name: text('name').notNull(),
});
export const repositories = pgTable(
  'repositories',
  {
    id: identity(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('fixture'),
    activeSnapshotId: uuid('active_snapshot_id'),
    createdAt: time('created_at'),
  },
  (t) => [
    unique().on(t.workspaceId, t.name),
    unique().on(t.workspaceId, t.id),
    check('fixture_only', sql`${t.kind} = 'fixture'`),
  ],
);

export const snapshots = pgTable(
  'snapshots',
  {
    id: identity(),
    workspaceId: uuid('workspace_id').notNull(),
    repositoryId: uuid('repository_id').notNull(),
    revision: text('revision').notNull(),
    fileCount: integer('file_count').notNull(),
    chunkCount: integer('chunk_count').notNull(),
    diagnostics: jsonb('diagnostics').$type<string[]>().notNull(),
    createdAt: time('created_at'),
  },
  (t) => [
    unique().on(t.workspaceId, t.id),
    unique().on(t.workspaceId, t.repositoryId, t.revision),
    foreignKey({
      columns: [t.workspaceId, t.repositoryId],
      foreignColumns: [repositories.workspaceId, repositories.id],
    }),
  ],
);

export const files = pgTable(
  'files',
  {
    id: identity(),
    workspaceId: uuid('workspace_id').notNull(),
    snapshotId: uuid('snapshot_id').notNull(),
    path: text('path').notNull(),
    content: text('content').notNull(),
    lineCount: integer('line_count').notNull(),
  },
  (t) => [
    unique().on(t.workspaceId, t.snapshotId, t.path),
    unique().on(t.workspaceId, t.snapshotId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.snapshotId],
      foreignColumns: [snapshots.workspaceId, snapshots.id],
    }),
    check('safe_file_path', sql`${t.path} !~ '(^/|(^|/)\\.\\.(/|$)|\\\\)'`),
  ],
);

export const chunks = pgTable(
  'chunks',
  {
    id: identity(),
    workspaceId: uuid('workspace_id').notNull(),
    snapshotId: uuid('snapshot_id').notNull(),
    fileId: uuid('file_id').notNull(),
    path: text('path').notNull(),
    content: text('content').notNull(),
    startLine: integer('start_line').notNull(),
    endLine: integer('end_line').notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.snapshotId, t.fileId],
      foreignColumns: [files.workspaceId, files.snapshotId, files.id],
    }),
    index().on(t.workspaceId, t.snapshotId),
    check(
      'chunk_lines',
      sql`${t.startLine} > 0 AND ${t.endLine} >= ${t.startLine}`,
    ),
  ],
);

export const conversations = pgTable(
  'conversations',
  {
    id: identity(),
    workspaceId: uuid('workspace_id').notNull(),
    repositoryId: uuid('repository_id').notNull(),
    createdAt: time('created_at'),
  },
  (t) => [
    unique().on(t.workspaceId, t.id),
    foreignKey({
      columns: [t.workspaceId, t.repositoryId],
      foreignColumns: [repositories.workspaceId, repositories.id],
    }),
  ],
);

export const runs = pgTable(
  'runs',
  {
    id: identity(),
    workspaceId: uuid('workspace_id').notNull(),
    repositoryId: uuid('repository_id').notNull(),
    conversationId: uuid('conversation_id'),
    snapshotId: uuid('snapshot_id'),
    kind: text('kind').notNull(),
    question: text('question'),
    status: text('status').notNull().default('queued'),
    cancelRequested: boolean('cancel_requested').notNull().default(false),
    result: jsonb('result').$type<unknown>(),
    error: text('error'),
    createdAt: time('created_at'),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    unique().on(t.workspaceId, t.id),
    index().on(t.workspaceId, t.createdAt),
    foreignKey({
      columns: [t.workspaceId, t.repositoryId],
      foreignColumns: [repositories.workspaceId, repositories.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.snapshotId],
      foreignColumns: [snapshots.workspaceId, snapshots.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.conversationId],
      foreignColumns: [conversations.workspaceId, conversations.id],
    }),
    check('run_kind', sql`${t.kind} IN ('index', 'question')`),
    check(
      'run_status',
      sql`${t.status} IN ('queued', 'running', 'completed', 'failed', 'cancelled')`,
    ),
  ],
);

export const messages = pgTable(
  'messages',
  {
    id: identity(),
    workspaceId: uuid('workspace_id').notNull(),
    conversationId: uuid('conversation_id').notNull(),
    runId: uuid('run_id').notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(),
    createdAt: time('created_at'),
  },
  (t) => [
    unique().on(t.runId, t.role),
    foreignKey({
      columns: [t.workspaceId, t.conversationId],
      foreignColumns: [conversations.workspaceId, conversations.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.runId],
      foreignColumns: [runs.workspaceId, runs.id],
    }),
  ],
);

export const jobs = pgTable(
  'jobs',
  {
    id: identity(),
    workspaceId: uuid('workspace_id').notNull(),
    runId: uuid('run_id').notNull().unique(),
    status: text('status').notNull().default('pending'),
    attempt: integer('attempt').notNull().default(0),
    fence: integer('fence').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    availableAt: time('available_at'),
    createdAt: time('created_at'),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.runId],
      foreignColumns: [runs.workspaceId, runs.id],
    }),
    index().on(t.status, t.availableAt),
    check(
      'job_status',
      sql`${t.status} IN ('pending', 'processing', 'completed', 'failed', 'cancelled')`,
    ),
    check('job_attempts', sql`${t.attempt} >= 0 AND ${t.maxAttempts} > 0`),
  ],
);

export const runEvents = pgTable(
  'run_events',
  {
    sequence: bigserial('sequence', { mode: 'number' }).primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    runId: uuid('run_id').notNull(),
    type: text('type').notNull(),
    message: text('message').notNull(),
    createdAt: time('created_at'),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.runId],
      foreignColumns: [runs.workspaceId, runs.id],
    }),
    index().on(t.workspaceId, t.runId, t.sequence),
  ],
);
