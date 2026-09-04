/**
 * KAI-126 — OpenTelemetry bootstrap for apps/mobile (Expo/React Native).
 *
 * Deliberately NOT the same shape as node.ts/web.ts: those rely on
 * auto-instrumentation packages (@opentelemetry/auto-instrumentations-node,
 * instrumentation-fetch) that patch Node's http module / the DOM fetch
 * global respectively — neither exists as such under Hermes, and every real
 * OTel React Native distro (Splunk, Honeycomb) that adds auto-instrumentation
 * does it via a native module + requires an EAS development build (breaks
 * Expo Go). apps/mobile has no functionality to auto-instrument yet anyway
 * (a single static screen, no network calls).
 *
 * This is the minimal, dependency-light alternative: a bare tracer provider
 * with no auto-instrumentation, so `trace.getTracer('kairo-mobile')` works
 * from anywhere in the app the moment there's a real event worth tracing —
 * manual spans only (`startSpan()`/`.end()` around whatever call is added).
 * Works in Expo Go; no native module, no EAS dev build required.
 *
 * Unverified end-to-end: apps/mobile has no app.json/dev script to actually
 * boot it today (a gap that predates this change, unrelated to observability)
 * — the OTLP HTTP exporter's fetch-based transport (the same package used
 * successfully in web.ts under Vite) is expected to bundle fine under Metro,
 * but that's untested. If Metro fails on it, swap the exporter for a plain
 * `fetch()` POST of OTLP JSON as a fallback — no other part of this file
 * would need to change.
 */
import { trace, type Tracer } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

export interface MobileTelemetryConfig {
  serviceName: string;
  otlpEndpoint?: string | undefined;
}

/** No-op tracer (via the OTel API's default) if `otlpEndpoint` is unset. */
export function initMobileTelemetry(config: MobileTelemetryConfig): Tracer {
  if (config.otlpEndpoint) {
    const provider = new BasicTracerProvider({
      resource: resourceFromAttributes({ 'service.name': config.serviceName }),
      spanProcessors: [
        new BatchSpanProcessor(new OTLPTraceExporter({ url: `${config.otlpEndpoint}/v1/traces` })),
      ],
    });
    trace.setGlobalTracerProvider(provider);
  }

  return trace.getTracer(config.serviceName);
}
