/**
 * KAI-126 — OpenTelemetry bootstrap. Loaded via `--preload` (see package.json
 * `dev` script) so it runs before any other import — required for OTel's
 * auto-instrumentation to patch `fetch`/`http` before they're used elsewhere.
 *
 * Reads raw `process.env` directly (not `./env`) to stay a minimal, dependency-free
 * entrypoint — importing the app's own env/module graph here would delay the patch.
 *
 * Two independent, optional destinations — either can be absent and the app still
 * starts normally:
 *   - ClickStack (OTEL_EXPORTER_OTLP_ENDPOINT) — general app traces.
 *   - Langfuse (LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY/LANGFUSE_BASE_URL) — LLM
 *     generation traces, emitted by @kairo/intelligence via @langfuse/tracing.
 */
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, type SpanProcessor } from '@opentelemetry/sdk-trace-base';

const spanProcessors: SpanProcessor[] = [];

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  spanProcessors.push(
    new BatchSpanProcessor(
      new OTLPTraceExporter({ url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces` }),
    ),
  );
}

if (process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) {
  spanProcessors.push(new LangfuseSpanProcessor());
}

if (spanProcessors.length > 0) {
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'kairo-api',
    spanProcessors,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
}
