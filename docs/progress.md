# Progress and handoff

## Current state

Phases 0 and 1 meet local acceptance on `feat/bootstrap-v0.1.0`. Own packages are coordinated at private `0.1.0`; OpenAPI takes its version from the backend package. Release v0.1.0 remains Unreleased: review/integration into master and release validation must precede any tag. No critical environmental blocker remains. This is local demo acceptance, not production readiness or remote CI confirmation.

## Implemented

- GitHub Flow on master, initial empty commit, local commit authorization boundaries, PR template and coordinated version policy.
- Strict pnpm monorepo, Next.js English workspace, generated OpenAPI client, Nest HTTP API and standalone worker.
- Dedicated Drizzle migrations, pgvector extension, PostgreSQL lexical index, immutable content snapshots, scoped relationships and persistent conversations/messages/runs/jobs/events.
- Safe bounded fixture ingestion with known renewal bug; atomic idempotent activation and original source lines.
- Demo provider, structured Zod validation, scoped citation resolution, no invented AI usage/cost.
- Jobs with SKIP LOCKED, lease/heartbeat, fencing, bounded recovery/retries, cooperative cancel and graceful shutdown.
- Persisted SSE sequence/cursor replay, frontend deduplication, run polling fallback and restart history.
- Portable setup/dev/doctor, same-origin gateway, complete Compose environment and GitHub CI for master PRs/pushes without credentials.
- Unit, PostgreSQL integration and browser tests; 12 annotated fixture cases.

## Verification ledger

Host: Windows PowerShell. Initial Node 20.20.0 / pnpm 10.19.0; project-local Node 24.21.0 installed. Docker daemon was initially stopped; it is now available. Local Compose PostgreSQL/pgvector container is healthy. No global runtime or Git identity was changed.

- Repository inspection: clean, unborn master, configured identity and origin https://github.com/cybermaique/repopilot-ai.git. Initial empty commit and bootstrap branch created; no remote writes.
- `pnpm install` and frozen-lockfile installation in the Linux Docker build: passed. ESLint 10 failed strict peer compatibility and was replaced with compatible pinned ESLint 9; warning documented in versions.
- `pnpm run doctor`: passed with local runtime and Docker.
- `pnpm run setup`: passed, including dedicated migrations and idempotent fixture registration.
- `pnpm contract:generate`: passed without connecting to a database.
- `pnpm lint`: ESLint with zero warnings and Prettier check passed; generated Next/OpenAPI files excluded appropriately.
- `pnpm typecheck`: all three packages passed with strict TypeScript, including tests and Next route type generation.
- `pnpm test`: 15 Jest backend unit tests and 5 Vitest/Testing Library frontend tests passed.
- `pnpm test:integration`: 15 tests passed against real PostgreSQL 17/pgvector in dedicated repopilot_test. Covers line/source integrity, immutable/idempotent indexing, lexical retrieval and abstention, direct and HTTP/SSE workspace isolation, SKIP LOCKED, atomic run/job creation, fencing/expiry/rollback/recovery, bounded attempts, queued/running cancel, a lock-wait cancellation race, shutdown persistence before pool closure, failed-index preservation, validation/contracts, cursor replay and persistence across a fresh Nest instance.
- Final 0.1.0 Linux container checks also passed: lint/format, strict types, 15 backend + 5 frontend unit tests and all 15 PostgreSQL integrations. These ran in a disposable verification container; the application runs as the non-root Node user. No external credentials used.
- `pnpm eval`: all 12 annotated retrieval/demo cases passed (9 answerable, 3 abstentions). Actual source IDs resolved in the pinned snapshot. No LLM metrics.
- `pnpm build`: API/client and optimized Next.js build passed on Windows and in the Linux Docker image.
- `pnpm test:e2e`: 2 Chromium flows passed with separate compiled API/worker, real database and gateway. Fixture → ask → actual source → reloaded history; unknown question → insufficient evidence/no invented sources. The same browser flows also passed against the complete Compose application. Screenshots inspected; source dialog centered with real revision/lines.
- One final E2E run exposed HTML-before-API startup readiness. The browser tests now poll API readiness and wait for workspace loading before interacting; the corrected run passed without adding retries to hide failures.
- `pnpm dev`: compiler watch, API, standalone worker, Next.js and gateway started; health readiness and the browser returned HTTP 200.
- Complete Docker build and `docker compose -f infra/compose.yaml up -d --wait`: passed. Migration exited 0; API/database were healthy; worker/web/gateway ran. HTTP smoke confirmed actual question processing, valid source and forwarded SSE.
- Restarted API, worker and PostgreSQL; exact persisted result and history matched before/after restart. Graceful application container stop preserved the database volume.
- Read-only `git ls-remote --heads origin`: returned no branches. Remote is still unpublished. See workflow for the initial master publication step.

GitHub Actions is configured for master PRs/pushes with lint/typecheck/tests/PostgreSQL/eval/build/E2E and contract drift checks. It has not run remotely because push/PR creation is not authorized. Do not infer remote CI execution or production readiness from local checks. The runtime/dependency notices are documented limitations, not failed checks.

## Local delivery

Local commits preserve the initial master commit and split workflow, tooling/infrastructure, backend/fixture/contracts, frontend, tests/evals and validated version/documentation preparation. Check `git log --oneline` for exact hashes. The working tree is to be left clean; actual .env, dependencies, builds, screenshots, traces and local review scripts remain ignored. No push, remote PR, merge, release tag or publication performed. The database container/volume is retained for the quickstart; application processes are stopped after verification.

## Continue safely

Read AGENTS.md, inspect Git status/history and preserve existing work. Follow README quickstart using **pnpm run setup/doctor**, because the unqualified names invoke pnpm built-ins. DB migration/seed are separate from API/worker boot. Integration testing touches only explicitly named repopilot_test. No push, remote PR, merge or release is authorized in bootstrap.

Next increment: a short phase-2 feature branch for public GitHub ingestion, commit-SHA snapshots and one real structured-output provider. Design actual authentication before public exposure. Publish this bootstrap branch and establish the initial remote master only in a later authorized action; then open a reviewed PR using the prepared template. Tag v0.1.0 only on the validated integrated master commit.
