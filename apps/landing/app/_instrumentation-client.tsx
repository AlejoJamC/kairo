'use client';

// KAI-126/KAI-189 — browser-side OTel bootstrap. Imported once (side-effect
// only) from app/layout.tsx so it runs before any fetch fires. No-op when
// NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT is unset.
import { initWebTelemetry } from '@kairo/observability/web';
import { env } from '@/env';

initWebTelemetry({
  serviceName: 'kairo-landing',
  otlpEndpoint: env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT,
});

export {};
