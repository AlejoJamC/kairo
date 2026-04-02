import { Hono } from "hono";
import { serve } from "inngest/hono";
import { inngest } from "./lib/inngest.js";
import { tier1FastPath } from "./functions/pipeline/tier1-fast-path.js";
import { health } from "./routes/v1/health.js";
import { tickets } from "./routes/v1/tickets.js";

const app = new Hono();

const v1 = new Hono();
v1.route("/", health);
v1.route("/tickets", tickets);

app.route("/v1", v1);

app.use(
  "/api/inngest",
  serve({ client: inngest, functions: [tier1FastPath] })
);

export default {
  port: 3001,
  fetch: app.fetch,
};
