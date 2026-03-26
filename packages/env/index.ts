import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    INTELLIGENCE_PROVIDER: z.enum(["claude", "ollama"]).default("ollama"),
    GMAIL_CLIENT_SECRET: z.string().min(1).optional(),
    SUPABASE_URL: z.string().url(),
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
