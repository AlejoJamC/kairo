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
import { ticketGroups } from "./routes/v1/ticket-groups.js";
import { sync } from "./routes/v1/sync.js";
import { tenants } from "./routes/v1/tenants.js";
import { templates } from "./routes/v1/templates.js";
import { sidebar } from "./routes/v1/sidebar.js";
import { intelligence } from "./routes/v1/intelligence.js";
import { supportSchedule } from "./routes/v1/support-schedule.js";
import { kbArticles } from "./routes/v1/kb-articles.js";
import { invitations } from "./routes/v1/invitations.js";

const app = new Hono({ strict: false });

const v1 = new Hono({ strict: false });
v1.route("/", health);
v1.route("/tickets", tickets);
v1.route("/ticket-groups", ticketGroups);
v1.route("/sync", sync);
v1.route("/tenants", tenants);
v1.route("/templates", templates);
v1.route("/sidebar", sidebar);
v1.route("/intelligence", intelligence);
v1.route("/support-schedule", supportSchedule);
v1.route("/kb-articles", kbArticles);
v1.route("/invitations", invitations);

app.route("/api/v1", v1);

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
