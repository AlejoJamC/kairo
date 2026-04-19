import { env as sharedEnv } from "@kairo/env";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const apiEnv = createEnv({
  server: {
    PORT: z.coerce.number().default(3001),
  },
  runtimeEnv: process.env,
});

export const env = { ...sharedEnv, ...apiEnv };
