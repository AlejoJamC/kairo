# @kairo/intelligence

Shared classification, native decisions, text generation, tool execution and embeddings.

Remote inference uses Vercel AI SDK and AI Gateway with the server-only `AI_GATEWAY_API_KEY`. Local Ollama remains available for classification, text and vectors. Each workflow role has its own model configuration; see [environment example](../../.env.example).

Use `classifyEmailWithMeta` for classification, `runDecisionFeature` for native judgments, `runLlmFeature` for structured text, `runLlmTextFeature` for free text, and `runAgentFeature` for bounded conversational tool execution. App callers reuse the logging harness and existing domain services.

`CLASSIFICATION_MODE=decision` uses versioned questions and validates complete probability distributions before deterministic composition. `language` uses the versioned classification prompt and a Zod output schema. Uncalibrated native decisions remain proposals requiring review.

`resolveModelRoute(role)` returns the configured transport, capability and model. Remote models are checked against the Gateway catalog. Unsupported capabilities, invalid output contracts and incompatible vector dimensions fail explicitly. There is no direct-provider fallback. Legacy Anthropic and JEV classes are compatibility aliases over Gateway.

Tests use synthetic inputs and mocked transports. Live Gateway smoke checks use invented examples only. See [evaluation instructions](../../scripts/eval/README.md). Production quality and calibration require a separately authorized private evaluation.

Embedding capabilities are checked at the service boundary using `FEATURE_FLAG_ENABLE_EMBEDDINGS`, `FEATURE_FLAG_ENABLE_EMBEDDING_GENERATION`, `FEATURE_FLAG_ENABLE_EMBEDDING_INDEXING` and `FEATURE_FLAG_ENABLE_EMBEDDING_RETRIEVAL` (all default to true). Disabling generation still permits queries backed by compatible stored vectors. New vector generation has a bounded wait; failures return typed reasons without provider payloads.

Backend consumers submit explicit authorized references through `requestSemanticIndexing` in the API's semantic indexing adapter. `accepted` includes the persisted Inngest event IDs and does not mean indexed. The worker validates revision, preparation and vector space, retries transient failures up to five times, and emits `embeddings/index.result` per reference. Disabled work emits `embeddings/index.progress` and waits durably; after enabling the controls, call `resumeSemanticIndexing(accountId)` explicitly. Reindexing uses the same submission operation and preserves compatible indices. Terminal failure remains visible in Inngest and in the result event; recovery requires explicit resubmission. The event transport and worker must be running for integration tests; mocked scheduler execution does not prove restart recovery.

Run `bun --no-env-file evals/technical.ts --durability` with the existing local Supabase, Inngest on port 8288 and Ollama on port 11434. Port 3001 must be free: the evaluation starts and restarts only its API worker and records private evidence of accepted work completing after restart. It never creates a database or applies schema changes.
