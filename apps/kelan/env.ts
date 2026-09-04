import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Phase 2: add SUPABASE_SERVICE_ROLE_KEY here when cross-tenant
    // dashboard queries are implemented (never expose as NEXT_PUBLIC_).
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_KELAN_URL: z.string().url().optional(),
    // KAI-126/KAI-189: browser-side OTel tracing. Unset -> disabled.
    NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
    // ClickStack's Ingestion API key. Without it every OTLP export 401s
    // (silently — the SDK swallows exporter errors by default).
    NEXT_PUBLIC_HYPERDX_INGESTION_API_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_KELAN_URL: process.env.NEXT_PUBLIC_KELAN_URL,
    NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT: process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT,
    NEXT_PUBLIC_HYPERDX_INGESTION_API_KEY: process.env.NEXT_PUBLIC_HYPERDX_INGESTION_API_KEY,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
