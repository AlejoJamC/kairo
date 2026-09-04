/**
 * KAI-126 — OpenTelemetry bootstrap for browser apps (dashboard). Call once,
 * as early as possible in the app's entry point (before rendering), so
 * fetch instrumentation is registered before any request fires.
 *
 * No ZoneContextManager: it requires transpiling to ES2015 (see
 * @opentelemetry/sdk-trace-web's own README), which conflicts with this
 * monorepo's ES2022 target. Spans stay correct for the common case (one
 * fetch call = one span); deeply nested async parent/child relationships
 * across awaits are not guaranteed to link. Revisit if that becomes a real
 * need — not a blocker for Phase 1 (recollection only, no dashboards yet).
 */
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

export interface WebTelemetryConfig {
  serviceName: string;
  otlpEndpoint?: string | undefined;
}

/** No-op if `otlpEndpoint` is unset. */
export function initWebTelemetry(config: WebTelemetryConfig): void {
  if (!config.otlpEndpoint) {
    return;
  }

  const provider = new WebTracerProvider({
    resource: resourceFromAttributes({ 'service.name': config.serviceName }),
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter({ url: `${config.otlpEndpoint}/v1/traces` })),
    ],
  });

  provider.register();

  registerInstrumentations({
    instrumentations: [new FetchInstrumentation()],
  });
}
