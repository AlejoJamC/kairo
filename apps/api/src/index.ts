import { workflow } from './routes/v1/workflow.js';
import { decisionWorkflows } from './functions/pipeline/decision-workflows.js';
import { Hono } from "hono";
import { httpInstrumentationMiddleware } from "@hono/otel";
import { serve } from "inngest/hono";
import { env } from "./env.js";
import { supabase } from "./lib/supabase.js";
import { checkEmbeddingDimensions, type ColumnDimensions } from "./lib/embedding-dimensions.js";
import { inngest } from "./lib/inngest.js";
import { tier1FastPath } from "./functions/pipeline/tier1-fast-path.js";
import { tier2Background } from "./functions/pipeline/tier2-background.js";
import { tier3Deferred } from "./functions/pipeline/tier3-deferred.js";
import { batchClassify } from "./functions/batch-classify.js";
import { incrementalSync } from "./functions/pipeline/incremental-sync.js";
import { knowledgeCandidate } from "./functions/pipeline/knowledge-candidate.js";
import { emailKnowledge } from './functions/pipeline/email-knowledge.js';
import { contactExtraction } from "./functions/contact-extraction/extract.js";
import { threadDedupeBackfill } from "./functions/backfill/thread-dedupe.js";
import { outboundMessageSend } from "./functions/outbound-send/send.js";
import { gmailPoll } from "./functions/inbound/gmail-poll.js";
import { gmailPollCron } from "./functions/inbound/gmail-poll-cron.js";
import { operationalSlaEscalationCron } from "./functions/operational-sla/escalation-check-cron.js";
import { classificationRetrySweep } from "./functions/pipeline/classification-retry-sweep.js";
import { autoApprovalRecomputeCron } from "./functions/pipeline/auto-approval-recompute-cron.js";
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
import { channels } from "./routes/v1/channels.js";
import { classificationProgress } from "./routes/v1/classification-progress.js";
import { admin } from "./routes/v1/admin.js";
import { notifications } from "./routes/v1/notifications.js";
import { members } from "./routes/v1/members.js";
import { notes } from "./routes/v1/notes.js";

const app = new Hono({ strict: false });

// KAI-126/KAI-189 — @opentelemetry/auto-instrumentations-node (in
// @kairo/observability/node's NodeSDK) patches Node's http/undici modules,
// which Bun's native server and fetch never go through — it silently
// creates zero spans for this app. @hono/otel instruments at the Hono
// middleware level instead, which works regardless of runtime.
app.use("*", httpInstrumentationMiddleware({ serviceName: "kairo-api" }));

const v1 = new Hono({ strict: false });
v1.route("/", health);
v1.route("/workflow", workflow);
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
v1.route("/accounts", channels);
v1.route("/classification", classificationProgress);
v1.route("/admin", admin);
v1.route("/notifications", notifications);
v1.route("/members", members);
v1.route("/notes", notes);

app.route("/api/v1", v1);

app.use(
  "/api/inngest",
  serve({
    client: inngest,
    functions: [decisionWorkflows, tier1FastPath, tier2Background, tier3Deferred, batchClassify, incrementalSync, contactExtraction, threadDedupeBackfill, outboundMessageSend, gmailPoll, gmailPollCron, operationalSlaEscalationCron, classificationRetrySweep, autoApprovalRecomputeCron, knowledgeCandidate, emailKnowledge],
  })
);

// Vectors from a model whose dimensions differ from the stored columns cannot be
// stored or compared: refuse to serve rather than fail on the first embedding.
if (process.env["NODE_ENV"] !== "test") {
  const check = await checkEmbeddingDimensions({
    readColumns: async () => {
      const { data, error } = await supabase.rpc("embedding_dimensions");
      if (error) throw new Error("Embedding dimensions unavailable");
      return (data ?? []) as ColumnDimensions[];
    },
  });
  if (check.status === "mismatch") {
    console.error(`[startup] Embedding model produces ${check.configured} dimensions but ${check.columns.map(c => `${c.table_name}.embedding has ${c.dimensions}`).join(", ")}; set EMBEDDING_DIMENSIONS to match or migrate the columns and re-embed`);
    process.exit(1);
  }
  if (check.status === "unverified") console.warn(`[startup] Embedding dimensions not verified: ${check.reason}`);
}

export default {
  port: env.PORT,
  fetch: app.fetch,
};
