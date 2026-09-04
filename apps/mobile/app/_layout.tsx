import { Stack } from "expo-router";
import { initMobileTelemetry } from "@kairo/observability/mobile";

// KAI-126 — no-op if EXPO_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT is unset. Mobile
// has no @t3-oss/env setup yet (unlike the other apps) — this reads
// process.env directly, matching Expo's own EXPO_PUBLIC_* convention for
// build-time-inlined client env vars. Revisit if/when mobile gets a real
// env.ts.
initMobileTelemetry({
  serviceName: "kairo-mobile",
  otlpEndpoint: process.env.EXPO_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT,
  // ClickStack's Ingestion API key. Without it every OTLP export 401s
  // (silently — the SDK swallows exporter errors by default).
  ingestionApiKey: process.env.EXPO_PUBLIC_HYPERDX_INGESTION_API_KEY,
});

export default function RootLayout() {
  return <Stack />;
}
