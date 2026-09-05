// KAI-126/KAI-189 — Next.js server-side OTel bootstrap (App Router convention:
// this file at the project root, loaded automatically before the app starts).
// Falls back to a no-op when OTEL_EXPORTER_OTLP_ENDPOINT is unset (standard
// OTel SDK env var, read automatically — no Vercel-specific config needed for
// self-hosted ClickStack).
import { registerOTel } from '@vercel/otel';

export function register() {
  registerOTel({ serviceName: 'kairo-landing' });
}
