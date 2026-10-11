# Changelog

## Unreleased

### Added

- GitHub Flow conventions, private coordinated version policy and pull request checklist.
- Private coordinated 0.1.0 metadata prepared for the validated phases 0 and 1; release awaits reviewed integration into master.
- Pinned TypeScript/pnpm workspace with Next.js App Router, NestJS HTTP API and standalone worker, Drizzle migrations and PostgreSQL/pgvector.
- Safe synthetic fixture ingestion, immutable SHA-256 snapshots, original source lines and atomic idempotent activation.
- PostgreSQL lexical full-text and identifier/path retrieval; deterministic Demo provider with validated output, source resolution and insufficient-evidence handling.
- Persistent runs/jobs/conversations/messages/events, lease/heartbeat, SKIP LOCKED, fencing, bounded recovery/retries and cooperative cancellation.
- English evidence workspace with snapshots, execution progress, source dialog, persisted history and accessible interaction.
- Replayable SSE through a same-origin gateway; portable setup/doctor/dev and complete local Docker Compose.
- Offline-generated OpenAPI/client, credential-free CI, unit/integration/E2E checks and 12 annotated fixture evaluations.

### Fixed

- Completion now reads cancellation and checks the lease after acquiring the job lock, preventing a stale pre-lock read from overriding a committed cancellation.
- Database pool closure follows worker/controller module shutdown, preserving their ability to persist cancellation/retry; workers stop before processing a claim obtained during shutdown.
- Browser checks wait for the independently started API and initial workspace loading, preventing startup timing from causing false failures.
- Source dialog centering, restored question context and terminal index status found during browser inspection.

### Limitations

- Local demo only: fixed development identity and deterministic extractive provider. Production startup refuses; no real auth, LLM, embeddings, semantic retrieval, GitHub ingestion, agent/MCP integration or deployment.
- Small literal-vocabulary fixture evaluations are not LLM quality or BM25 measurements. No fabricated usage/cost metrics.
- Latest 50 runs in UI, one job per worker, bounded local ingestion/queue/streams; no production retention or public-demo protections yet.
- ESLint 9 and some transitive tooling are deprecated; pinned for compatible Next.js plugin peers. Gateway's upstream http-proxy emits a Node deprecation notice. See docs/versions.md.
- No push, remote PR/CI execution, merge, release publication or Git release tag performed.
