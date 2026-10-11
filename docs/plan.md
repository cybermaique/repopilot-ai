# Plan and acceptance

| Phase | Scope                                                                    | Acceptance                                                                                                             |
| ----- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 0     | Structure, environment, docs, PostgreSQL/pgvector, health and CI         | Reproducible setup, dedicated migrations, offline contracts, strict build and deterministic checks                     |
| 1     | Safe fixture, lexical retrieval, Demo provider, jobs/SSE/history/sources | Complete browser → API → job → worker → database flow; valid source excerpts; restart persistence; visible limitations |
| 2     | Public GitHub ingestion and real LLM                                     | Public repository allowlist, commit-SHA snapshots, structured provider output, timeouts and grounding                  |
| 3     | Embeddings and hybrid retrieval                                          | pgvector retrieval, lexical baseline comparisons, annotated independent evaluation                                     |
| 4     | LangGraph TypeScript agent                                               | Limited tools, PostgreSQL checkpoints, resume/cancel, persisted execution                                              |
| 5     | MCP                                                                      | Official TypeScript SDK, real authenticated integration, isolation, GitHub App where needed                            |
| 6     | Observability, costs, protected demo and deployment                      | Actual model accounting, budgets, abuse controls, telemetry and verified deployment                                    |
| 7     | Public portfolio delivery                                                | English README, demo video, ADRs, measured results and reviewed release                                                |

Optional extensions: issue publication only with explicit approval; provider comparisons. Executing imported code, autonomous patches and merges are outside the core.

## Bootstrap acceptance gate

- Documented startup works and needs no external credentials.
- The fixture indexes into an immutable content snapshot without executing code or following symlinks.
- A browser question reaches API, transactional run/job creation, separate worker, retrieval, validated demo answer and database.
- Citations resolve actual workspace/snapshot/file/line data and open correct excerpts.
- History, messages, results and events survive service restart.
- Index failures preserve the active revision; stale workers cannot finalize; retries are bounded and cancellation is explicit.
- Loading, empty/error/cancelled/insufficient-evidence states are visible. UI marks Demo provider.
- Lint, formatting, strict types, unit/integration/E2E tests, annotated evaluation and builds have actual evidence. Critical unexecuted checks remain pending with exact blockers.
- OpenAPI generation requires no database. Client matches the generated schema.

Do not prepare 0.1.0 or declare completion while critical checks are pending. See progress for current results.
