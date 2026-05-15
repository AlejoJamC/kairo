import {createEnv} from "@t3-oss/env-nextjs";
import {z} from "zod";

export const env = createEnv({
    server: {
        GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
        // Service role key — used server-side only (callback duplicate detection).
        // Never exposed to the client bundle.
        SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
        // Inngest event-sending credentials (KAI-202 onboarding pipeline dispatch).
        INNGEST_EVENT_KEY: z.string().min(1).optional(),
        // Kill-switch for KAI-202 dispatch: set to "true" to disable without redeploy.
        DISABLE_ONBOARDING_PIPELINE_DISPATCH: z.string().optional(),
        // Ollama model selection (local dev: change without code)
        OLLAMA_MODEL: z.string().optional(),
        OLLAMA_BASE_URL: z.string().url().optional(),
    },
    client: {
        NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
        NEXT_PUBLIC_APP_URL: z.string().url(),
        NEXT_PUBLIC_DASHBOARD_URL: z.string().default("/dashboard"),
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
    },
    runtimeEnv: {
        GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
        DISABLE_ONBOARDING_PIPELINE_DISPATCH: process.env.DISABLE_ONBOARDING_PIPELINE_DISPATCH,
        OLLAMA_MODEL: process.env.OLLAMA_MODEL,
        OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        NEXT_PUBLIC_DASHBOARD_URL: process.env.NEXT_PUBLIC_DASHBOARD_URL,
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    },
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    emptyStringAsUndefined: true,
});
