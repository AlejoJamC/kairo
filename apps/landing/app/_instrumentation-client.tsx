'use client';

// KAI-126/KAI-189 — browser-side OTel bootstrap. Must be *rendered* (not just
// imported) from app/layout.tsx: a side-effect-only import of a Client
// Component from a Server Component isn't guaranteed to survive Next.js's
// client bundling — this was silently dropped until it was actually
// referenced in the JSX tree. Runs once (module-level, on first load) before
// any fetch fires, and renders nothing.
import { initWebTelemetry } from '@kairo/observability/web';
import { env } from '@/env';

initWebTelemetry({
  serviceName: 'kairo-landing',
  otlpEndpoint: env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT,
  ingestionApiKey: env.NEXT_PUBLIC_HYPERDX_INGESTION_API_KEY,
});

export function InstrumentationClient() {
  return null;
}
