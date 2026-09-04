/**
 * KAI-126 — loaded via `--preload` (see package.json `dev` script) so it runs
 * before any other import. Reads raw `process.env` directly (not `./env`) to
 * stay a minimal, dependency-free entrypoint — importing the app's own
 * env/module graph here would delay the instrumentation patch.
 */
import { initNodeTelemetry } from '@kairo/observability/node';

initNodeTelemetry({
  serviceName: process.env.OTEL_SERVICE_NAME ?? 'kairo-api',
  otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  langfusePublicKey: process.env.LANGFUSE_PUBLIC_KEY,
  langfuseSecretKey: process.env.LANGFUSE_SECRET_KEY,
});
