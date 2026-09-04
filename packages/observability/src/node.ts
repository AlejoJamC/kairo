/**
 * KAI-126 — OpenTelemetry bootstrap for Node/Bun server processes. Call once,
 * before any other import (Bun `--preload` / Node `--require`), so the SDK's
 * auto-instrumentation patches `fetch`/`http` before they're used elsewhere.
 *
 * Two independent, optional destinations — either can be absent and the caller
 * still starts normally:
 *   - `otlpEndpoint` — general app traces (e.g. ClickStack's OTel Collector).
 *   - `langfusePublicKey`/`langfuseSecretKey` — LLM generation traces, emitted by
 *     @kairo/intelligence via @langfuse/tracing. LangfuseSpanProcessor reads its
 *     own config (LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY/LANGFUSE_BASE_URL) from
 *     process.env directly — the keys here only gate whether it's registered.
 */
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, type SpanProcessor } from '@opentelemetry/sdk-trace-base';
import { otlpTracesUrl } from './shared';

export interface NodeTelemetryConfig {
  serviceName: string;
  otlpEndpoint?: string | undefined;
  langfusePublicKey?: string | undefined;
  langfuseSecretKey?: string | undefined;
}

/** Returns the started SDK, or null if neither destination was configured. */
export function initNodeTelemetry(config: NodeTelemetryConfig): NodeSDK | null {
  const spanProcessors: SpanProcessor[] = [];

  if (config.otlpEndpoint) {
    spanProcessors.push(
      new BatchSpanProcessor(new OTLPTraceExporter({ url: otlpTracesUrl(config.otlpEndpoint) })),
    );
  }

  if (config.langfusePublicKey && config.langfuseSecretKey) {
    spanProcessors.push(new LangfuseSpanProcessor());
  }

  if (spanProcessors.length === 0) {
    return null;
  }

  const sdk = new NodeSDK({
    serviceName: config.serviceName,
    spanProcessors,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  return sdk;
}
