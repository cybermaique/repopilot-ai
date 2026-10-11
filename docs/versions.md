# Versions and compatibility

Own workspace packages started at private `0.0.0`; they are now coordinated at private `0.1.0` after local bootstrap acceptance. This prepares release metadata, not a published release. No release tag exists on the feature branch; v0.1.0 can be tagged only after reviewed integration and validation on master.

Dependencies are exact in package manifests and resolved by committed pnpm-lock.yaml. Runtime: Node 24.21.0 (`.node-version`, project-local `node` package, CI and container). Package manager: pnpm 10.19.0. Initial host inspection found Windows, Node 20.20.0 and pnpm 10.19.0. Installation pins a newer runtime locally without changing the global Node installation.

| Component                   | Selected version             | Reason                                                                                                                            |
| --------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Next.js / React             | 16.4.0 / 19.3.0              | Stable registry releases, App Router and compatible peer ranges                                                                   |
| NestJS / Swagger            | 12.1.2 / 12.0.2              | Same major; native ESM backend and separate standalone worker                                                                     |
| TypeScript                  | 5.9.3                        | Strict types, compatible with Swagger and ts-jest peer requirements                                                               |
| Drizzle ORM / Kit           | 0.45.4 / 0.31.11             | pg adapter and generated/versioned SQL migrations                                                                                 |
| PostgreSQL / pgvector image | pgvector/pgvector:0.8.1-pg17 | PostgreSQL 17 with extension preinstalled; extension enabled via migration                                                        |
| pg / Zod                    | 8.23.1 / 4.6.6               | Parameterized SQL and runtime schema validation                                                                                   |
| Tailwind                    | 4.3.3                        | Local PostCSS integration; no external font request                                                                               |
| OpenAPI TypeScript / fetch  | 7.13.0 / 0.17.0              | Generated schema plus typed request client                                                                                        |
| Vitest / Testing Library    | 4.0.18 / 16.3.3              | UI behavior and escaped untrusted content                                                                                         |
| Jest / ts-jest / Supertest  | 30.5.2 / 29.4.14 / 7.2.2     | Native ESM tests and real HTTP integration                                                                                        |
| Playwright                  | 1.64.0                       | Browser flow with actual API/worker/database                                                                                      |
| ESLint / typescript-eslint  | 9.39.1 / 8.71.1              | Next.js bundled React/import/accessibility plugins still declare ESLint 9 peers; ESLint 10 install was rejected with strict peers |
| Prettier                    | 3.9.10                       | Reproducible formatting                                                                                                           |

ESLint 9 is deprecated upstream. It remains deliberately pinned for the Next.js lint plugin peer compatibility in this bootstrap; replace it once that dependency set supports ESLint 10. Drizzle Kit transitively uses deprecated esbuild-kit tooling; do not disable peer checks or globally alter packages to hide notices. Jest native ESM uses Node's `--experimental-vm-modules`; this is test tooling, not the API runtime.

## Official documentation consulted

- [Next.js installation](https://nextjs.org/docs/app/getting-started/installation) and [Next.js 16 migration](https://nextjs.org/docs/app/guides/upgrading/version-16): runtime/type/lint requirements.
- [NestJS migration guide](https://docs.nestjs.com/migration-guide): v12 ESM and Node compatibility. The backend uses `type: module`, NodeNext imports and decorator metadata.
- [Node release policy](https://nodejs.org/en/about/previous-releases): active LTS line selection.
- [Drizzle PostgreSQL extensions](https://orm.drizzle.team/docs/extensions): create vector extension explicitly; no embeddings required now.

Exact package versions and peer requirements were checked against the npm registry during bootstrap. Container tags are pinned; future security upgrades require their own short branch and the same checks.
