import { Hono } from "hono";
import { serve } from "inngest/hono";
import { inngest } from "./lib/inngest.js";
import { tier1FastPath } from "./functions/pipeline/tier1-fast-path.js";
import { tier2Background } from "./functions/pipeline/tier2-background.js";
import { tier3Deferred } from "./functions/pipeline/tier3-deferred.js";
import { batchClassify } from "./functions/batch-classify.js";
import { incrementalSync } from "./functions/pipeline/incremental-sync.js";
import { health } from "./routes/v1/health.js";
import { tickets } from "./routes/v1/tickets.js";
import { sync } from "./routes/v1/sync.js";

const app = new Hono();

const v1 = new Hono();
v1.route("/", health);
v1.route("/tickets", tickets);
v1.route("/sync", sync);

app.route("/v1", v1);

app.use(
  "/api/inngest",
  serve({
    client: inngest,
    functions: [tier1FastPath, tier2Background, tier3Deferred, batchClassify, incrementalSync],
  })
);

export default {
  port: 3001,
  fetch: app.fetch,
};
