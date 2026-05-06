import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const testFallbackEnv = {
  VITE_SUPABASE_URL:
    import.meta.env.VITE_SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL ??
    "http://localhost:54321",
  VITE_SUPABASE_ANON_KEY:
    import.meta.env.VITE_SUPABASE_ANON_KEY ??
    process.env.VITE_SUPABASE_ANON_KEY ??
    "test-anon-key",
  VITE_LANDING_URL:
    import.meta.env.VITE_LANDING_URL ?? process.env.VITE_LANDING_URL ?? "",
};

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_SUPABASE_URL: z.string().url(),
    VITE_SUPABASE_ANON_KEY: z.string().min(1),
    VITE_LANDING_URL: z.string().default(""),
  },
  runtimeEnv: {
    ...testFallbackEnv,
    ...import.meta.env,
  },
});
