# @kairo/intelligence

Shared classification, native decisions, text generation, tool execution and embeddings.

Remote inference uses Vercel AI SDK and AI Gateway with the server-only `AI_GATEWAY_API_KEY`. Local Ollama remains available for classification, text and vectors. Each workflow role has its own model configuration; see [environment example](../../.env.example).

Use `classifyEmailWithMeta` for classification, `runDecisionFeature` for native judgments, `runLlmFeature` for structured text, `runLlmTextFeature` for free text, and `runAgentFeature` for bounded conversational tool execution. App callers reuse the logging harness and existing domain services.

`CLASSIFICATION_MODE=decision` uses versioned questions and validates complete probability distributions before deterministic composition. `language` uses the versioned classification prompt and a Zod output schema. Uncalibrated native decisions remain proposals requiring review.

`resolveModelRoute(role)` returns the configured transport, capability and model. Remote models are checked against the Gateway catalog. Unsupported capabilities, invalid output contracts and incompatible vector dimensions fail explicitly. There is no direct-provider fallback. Legacy Anthropic and JEV classes are compatibility aliases over Gateway.

Tests use synthetic inputs and mocked transports. Live Gateway smoke checks use invented examples only. See [evaluation instructions](../../scripts/eval/README.md). Production quality and calibration require a separately authorized private evaluation.
