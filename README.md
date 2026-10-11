# RepoPilot AI

An evidence workspace for exploring repositories. Ask a question, follow the persisted execution, and open the cited file at the exact snapshot and lines.

**Phases 0–1: local demo.** The included synthetic TypeScript repository contains a known token-renewal bug. The **Demo provider** is deterministic and extractive: it quotes actual PostgreSQL lexical retrieval results, validates references and abstains when evidence is insufficient. It is not an LLM, semantic search, embeddings or BM25. No external account, API key, model token metrics or model costs are required.

Private package metadata is prepared at **0.1.0** after local acceptance. The release remains Unreleased until reviewed integration and validation on master. No remote publication or feature-branch release tag has occurred.

## Quickstart: Windows PowerShell or Linux/WSL

Prerequisites: Node >=20.20 to install, pnpm 10.19.0, and a running Docker Engine/Desktop with Compose. Installation adds the pinned Node 24.21.0 runtime **inside this project**; no global runtime change is needed. If pnpm is missing, install/activate the pinned package manager using your existing Node tooling. See [versions](docs/versions.md).

```sh
pnpm install --frozen-lockfile
pnpm run doctor
pnpm run setup
pnpm dev
```

Open **http://localhost:8088**. Setup copies `.env.example` only if `.env` does not exist, starts the PostgreSQL container, applies dedicated migrations and registers the fixture. Select **Index fixture**, wait for the active snapshot, then ask **Why does renewSession keep the token expired?** Open a source citation and inspect **Run history**. `Ctrl+C` stops the development processes; the database volume preserves history.

`pnpm run doctor` and `pnpm run setup` need `run`: pnpm also has built-in doctor/setup commands. All commands above work in PowerShell and Linux/WSL; no Make or Bash is required.

Defaults: gateway 8088, API 4100, Next.js 3100, PostgreSQL 55432. Keep the origin `http://localhost:8088` (not an alternate hostname) for browser mutations. If changing ports, update `.env` including LOCAL_ORIGIN and gateway targets. Existing environment variables override the environment file. Never publish the demo auth mode on a public network.

## Entire application in Docker

```sh
docker compose -f infra/compose.yaml up --build --wait
```

Open http://localhost:8088, click **Register sample repository**, then **Index fixture**. The dedicated one-shot migration service completes before API and worker start. API and worker are separate processes; the worker has no HTTP server. The gateway serves one origin and forwards SSE without buffering. Containers run the application as the non-root Node user. Database and gateway host ports bind to 127.0.0.1.

Stop with `docker compose -f infra/compose.yaml down`. This keeps the database volume. **Do not add `-v` unless intentionally deleting your local history.** Do not run native and Compose application processes on the same ports simultaneously.

## Commands and validation

```sh
pnpm db:migrate
pnpm seed
pnpm contract:generate
pnpm lint
pnpm typecheck
pnpm test
pnpm db:test:create
pnpm test:integration
pnpm eval
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Linux CI installs Chromium system dependencies with `pnpm exec playwright install --with-deps chromium`. E2E starts its own compiled API, standalone worker, Next.js server and gateway, so run it after build with ports free. It uses the local demo database and adds history. Integration tests refuse to run unless TEST_DATABASE_URL explicitly names **repopilot_test**; they truncate only that dedicated test database. Compose creates it on first initialization; `pnpm db:test:create` also creates it idempotently. Never point that setting at a shared database.

`pnpm eval` checks 12 annotated fixture cases against actual lexical retrieval, source resolution and demo abstention. Run it with other workers stopped. Results are fixture smoke checks, not LLM quality measurements. Actual execution results and any blockers are recorded in [progress](docs/progress.md).

The API exposes [Swagger UI](http://localhost:8088/api/docs), `/api/health/live`, `/api/health/ready`, repositories/snapshots, index requests, runs/history/events, SSE, cancellation and scoped source retrieval. `pnpm contract:generate` works offline without a database; commit both OpenAPI and generated client changes.

## Implementation boundaries

- Implemented: bounded safe fixture ingestion, content-addressed immutable snapshots, original file/chunk lines, atomic activation, PostgreSQL full-text plus identifier/path matching, validated demo output, scoped source resolution, persistent jobs/events/history and cooperative cancellation.
- Implemented: transactional run/job creation; short SKIP LOCKED claims; leases, heartbeat, fencing, bounded retries/recovery; SSE cursor replay; accessible English workspace with errors, insufficient evidence and source dialog.
- Demonstrative: fixed local identity and extractive Demo provider. Production startup always refuses because real authentication is not implemented. There is one fixed server-owned fixture, not arbitrary local paths or public GitHub ingestion.
- Planned: real GitHub snapshots and LLM provider (phase 2); embeddings/hybrid retrieval and broader evaluation (3); durable LangGraph agent (4); authenticated MCP (5); public-demo protections/observability/deploy (6); portfolio publication (7).

Imported content is untrusted data. The fixture is read, never executed. No HTML/Markdown renderer accepts imported content: React renders it as escaped text. Own packages are private and version-coordinated. See [workflow](docs/development-workflow.md), [architecture](docs/architecture.md), [plan](docs/plan.md), [decisions](docs/adr/0001-local-evidence-workspace.md) and [AGENTS.md](AGENTS.md).
