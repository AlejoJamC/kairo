import {createEnv} from "@t3-oss/env-core";
import {z} from "zod";

export const env = createEnv({
    server: {
        SUPABASE_URL: z.string().url(),
        SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
        INTELLIGENCE_PROVIDER: z.enum(["claude", "ollama", "anthropic"]).default("ollama"),
        ANTHROPIC_API_KEY: z.string().min(1).optional(),
        OLLAMA_BASE_URL: z.string().url().optional(),
        OLLAMA_MODEL: z.string().default("qwen2.5:14b"),
        FAST_PATH_SCAN_SIZE: z.coerce.number().int().positive().default(30),
        FAST_PATH_ESCAPE_COUNT: z.coerce.number().int().positive().default(3),
        FAST_PATH_CONCURRENCY: z.coerce.number().int().positive().default(3),
        BACKGROUND_CONCURRENCY: z.coerce.number().int().positive().default(3),
        TIER_2_WINDOW_DAYS: z.coerce.number().int().positive().default(15),
        MAX_EMAIL_AGE_DAYS: z.coerce.number().int().positive().default(90),
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
