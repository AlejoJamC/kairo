import {createEnv} from "@t3-oss/env-core";
import {z} from "zod";

export const env = createEnv({
    server: {
        SUPABASE_URL: z.string().url(),
        SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
        INTELLIGENCE_PROVIDER: z.enum(["claude", "ollama", "anthropic"]).default("ollama"),
        ANTHROPIC_API_KEY: z.string().min(1).optional(),
        OLLAMA_BASE_URL: z.string().url().optional(),
        OLLAMA_MODEL: z.string().optional().default("granite4.1:3b"),
        OLLAMA_EMBEDDING_MODEL: z.string().optional().default("nomic-embed-text-v2-moe"),
        OLLAMA_EMBEDDING_DIMENSIONS: z.coerce.number().optional().default(384),
        FAST_PATH_SCAN_SIZE: z.coerce.number().int().positive().default(30),
        FAST_PATH_ESCAPE_COUNT: z.coerce.number().int().positive().default(3),
        FAST_PATH_CONCURRENCY: z.coerce.number().int().positive().default(3),
        BACKGROUND_CONCURRENCY: z.coerce.number().int().positive().default(3),
        TIER_2_WINDOW_DAYS: z.coerce.number().int().positive().default(15),
        MAX_EMAIL_AGE_DAYS: z.coerce.number().int().positive().default(90),
        BATCH_SYNC_LIMIT: z.coerce.number().int().positive().default(20),
        INCREMENTAL_SYNC_CONCURRENCY: z.coerce.number().int().positive().default(3),
        // Kelan backoffice — optional comma-separated admin email allowlist
        KELAN_ADMIN_EMAILS: z.string().optional(),
        GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
        // Inngest event-sending credentials (landing BFF → Inngest cloud).
        // Optional: when unset, dispatch is skipped (e.g. local dev without Inngest).
        INNGEST_EVENT_KEY: z.string().min(1).optional(),
        // KAI-202 kill-switch: disable onboarding pipeline dispatch from OAuth callback
        // without redeploying. Any value other than "true" leaves dispatch enabled.
        DISABLE_ONBOARDING_PIPELINE_DISPATCH: z.string().optional(),
    },
    clientPrefix: "VITE_",
    client: {
        VITE_SUPABASE_URL: z.string().url().optional(),
        VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
    },
    runtimeEnv: process.env,
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    emptyStringAsUndefined: true,
});
