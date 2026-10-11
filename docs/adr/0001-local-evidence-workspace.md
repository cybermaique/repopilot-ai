# ADR 0001: Local evidence workspace before real providers

Status: accepted for phases 0–1.

Use a pnpm TypeScript monorepo: Next.js web, NestJS HTTP and standalone worker, PostgreSQL/pgvector and Drizzle. PostgreSQL combines persistent queue, domain data, FTS and events; avoid Redis/BullMQ and migration races. Native ESM matches the selected Nest 12 packages; compile with tsc to preserve runtime decorator metadata. API OpenAPI is generated offline and consumed via openapi-typescript/openapi-fetch.

Use only a server-owned synthetic fixture in bootstrap. Store full files and bounded contiguous chunks with SHA-256 content revisions and immutable database content. Activate only with a complete transaction under a valid worker fence. This limits ingestion risk and gives stable citations before adding public GitHub snapshots.

Use PostgreSQL lexical retrieval, native full-text rank, identifier/path matching and a deterministic extractive provider. Benefits: no credentials, reproducible checks, explicit abstention and source-validation contracts. Costs: vocabulary-limited retrieval, simple literal coverage heuristics, no natural-language reasoning or semantic relevance. Real provider/hybrid evaluation belongs to phases 2–3.

Local auth is fixed and production refuses to boot. Loopback infrastructure and browser origin checks limit the demonstration boundary; they do not replace real authentication, roles, tenancy or public-demo protection. Imported text is escaped, not rendered as HTML or executed. Future agents must treat it as untrusted data and add tool isolation.

GitHub Flow uses master and reviewed short branches, coordinated private versions and Unreleased changelog. No release automation, package publication or feature-branch release tags. Real release tags follow integration/validation on master.
