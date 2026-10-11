# Fixture evaluation

`pnpm eval` runs 12 annotated cases against the real PostgreSQL lexical index and deterministic Demo provider. It registers/indexes the fixture through backend services, then checks evidence status, expected cited paths and source validity. It prints actual counts and exits nonzero on a failed annotation.

These are smoke evaluations of lexical retrieval and extractive abstention, **not LLM quality, semantic retrieval, BM25, token or cost benchmarks**. The tiny fixture and literal vocabulary are deliberately limited. Future phases should add larger independent datasets, ranked retrieval baselines and real provider evaluation.
