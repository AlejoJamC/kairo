import { Hono } from "hono";
import { z } from "zod";
import { classifyEmailWithMeta, generateEmbedding, extractPromptVersion } from "@kairo/intelligence";
import { logLlmCall } from "../../lib/llm-logging.js";
import { supabase } from "../../lib/supabase.js";
import { resolveUserAndAccount } from "../../lib/auth.js";
import { inngest } from "../../lib/inngest.js";
import { env } from "../../env.js";
import {
  ClassifyBatchRequestSchema,
  CorrectClassificationSchema,
  type BatchTicketResult,
} from "../../lib/schemas/classification.js";
import {
  computePriorityScore,
  DEFAULT_WEIGHTS,
  type TenantWeights,
} from "../../lib/scoring.js";
import { computeSlaDeadline, normalizePlanTier } from "../../lib/sla.js";
import { attachOperationalSla, buildConfigByPriority } from "../../lib/operational-sla.js";
import { emitTicketEvent } from "../../lib/ticket-events.js";
import { createCompletionProvider, detectEscalationTriggers } from "@kairo/intelligence";
import type { EscalationContext } from "@kairo/intelligence";
import { resolveModelVersion } from "../../lib/model-version.js";
import { planScoreFromTier, computeClientFlags } from "../../lib/client-profile.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  isValidTransition,
  getTransitionError,
  isTicketStatus,
  type TicketStatus,
} from "../../lib/ticket-status-machine.js";
import { upsertConversationByThread } from "../../lib/conversations.js";
import { linkMessageToTicket, countTicketMessages } from "../../lib/ticket-messages.js";
import { appendKairoToken, buildKairoToken } from "../../lib/ticket-traceability.js";
import { resolveTemplateVars, buildPlainBody, plainToHtmlParagraphs, type TemplateVars } from "../../lib/template-renderer.js";
import { resolveAgentIdentity } from "../../lib/agent-identity.js";
import { humanizeDuration } from "../../lib/duration.js";
import { renderAgentReply, renderResolved } from "../../emails/registry.js";
import { resolveEmailUrls } from "../../emails/urls.js";
import { formatEmailDate } from "../../emails/format.js";

export const tickets = new Hono();

// ---------------------------------------------------------------------------
// Auth helper (shared across endpoints)
// ---------------------------------------------------------------------------

// Auth resolved via resolveUserAndAccount from lib/auth.ts (ADR-022).

// ---------------------------------------------------------------------------
// GET /v1/tickets — paginated list sorted by priority_score DESC NULLS LAST
// ---------------------------------------------------------------------------

tickets.get("/", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const cursor = c.req.query("cursor");

  let query = supabase
    .from("tickets")
    .select("*")
    .eq("account_id", ctx.accountId)
    .order("priority_score", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .limit(limit);

  if (cursor) {
    try {
      const { score, id } = JSON.parse(atob(cursor)) as { score: number | null; id: string };
      if (score !== null) {
        query = query.or(
          `priority_score.lt.${score},and(priority_score.eq.${score},id.gt.${id})`
        );
      } else {
        query = query.is("priority_score", null).gt("id", id);
      }
    } catch {
      return c.json({ error: "Invalid cursor" }, 400);
    }
  }

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);

  const items = data ?? [];
  const last = items.at(-1);
  const nextCursor =
    items.length === limit && last
      ? btoa(JSON.stringify({ score: last.priority_score ?? null, id: last.id }))
      : null;

  // KAI-168 — attach the operational SLA (by ticket priority) computed field.
  const { data: slaConfigRows } = await supabase
    .from("ticket_priority_sla_config")
    .select("priority, max_response_seconds, min_response_seconds, risk_alert_seconds, escalation_seconds")
    .eq("account_id", ctx.accountId);
  const configByPriority = buildConfigByPriority(slaConfigRows ?? []);
  const enrichedItems = attachOperationalSla(items, configByPriority);

  return c.json({ data: enrichedItems, next_cursor: nextCursor, count: enrichedItems.length });
});

// ---------------------------------------------------------------------------
// POST /v1/tickets/:id/recalculate-score
// ---------------------------------------------------------------------------

tickets.post("/:id/recalculate-score", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");

  // 1. Fetch ticket
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, ticket_type, sentiment, received_at, created_at, from_email, client_id, emotion, originating_user_id")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .single();

  if (ticketErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  // 2. Fetch client plan
  let planTier: TenantWeights extends never ? never : ReturnType<typeof normalizePlanTier> =
    "none" as const;
  if (ticket.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("plan_type")
      .eq("id", ticket.client_id)
      .single();
    planTier = normalizePlanTier(client?.plan_type);
  }

  // 3. Fetch recent ticket count (same sender, last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { count: recentCount } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("account_id", ctx.accountId)
    .eq("from_email", ticket.from_email ?? "")
    .gte("created_at", thirtyDaysAgo);

  // 4. Fetch tenant weights (fallback to defaults)
  const { data: configRow } = await supabase
    .from("tenant_priority_config")
    .select("weight_type, weight_plan, weight_emotion, weight_age")
    .eq("account_id", ctx.accountId)
    .single();

  const weights: TenantWeights = configRow
    ? {
        weightType:    configRow.weight_type,
        weightPlan:    configRow.weight_plan,
        weightEmotion: configRow.weight_emotion,
        weightAge:     configRow.weight_age,
      }
    : DEFAULT_WEIGHTS;

  // 5. Compute score
  const receivedAt = ticket.received_at ?? ticket.created_at ?? new Date().toISOString();
  const priorityScore = computePriorityScore(
    {
      type: (ticket.ticket_type as Parameters<typeof computePriorityScore>[0]["type"]) ?? "other",
      tone: (ticket.sentiment as Parameters<typeof computePriorityScore>[0]["tone"]) ?? "neutral",
      plan: planTier,
      receivedAt,
      recentTicketCount: recentCount ?? 0,
    },
    weights
  );

  // 6. Compute sla_due_at from tenant_sla_rules
  let sla_due_at: string | null = null;
  const { data: slaRule } = await supabase
    .from("tenant_sla_rules")
    .select("response_hours")
    .eq("account_id", ctx.accountId)
    .eq("ticket_type", ticket.ticket_type ?? "")
    .eq("plan_tier", planTier)
    .single();

  if (slaRule) {
    sla_due_at = computeSlaDeadline(receivedAt, slaRule.response_hours);
  }

  // 7. Persist
  const score_computed_at = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("tickets")
    .update({ priority_score: priorityScore, sla_due_at, score_computed_at })
    .eq("id", id);

  if (updateErr) return c.json({ error: updateErr.message }, 500);

  return c.json({
    priority_score: priorityScore,
    sla_due_at,
    emotion: ticket.emotion,
    score_computed_at,
  });
});

// ---------------------------------------------------------------------------
// GET /v1/tickets/:id/related-history — historically resolved similar tickets (KAI-21)
// Primary: pgvector RPC find_similar_tickets filtered to status='resolved'
// Fallback: full-text match on from_email or subject keywords when RPC unavailable
// ---------------------------------------------------------------------------

tickets.get("/:id/related-history", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");

  // Verify ticket belongs to user
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, from_email, subject")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .single();

  if (ticketErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  // Primary: pgvector RPC
  const { data: rpcData, error: rpcError } = await supabase.rpc("find_similar_tickets", {
    p_ticket_id: id,
    p_account_id: ctx.accountId,
    p_limit: 3,
    p_status_filter: "resolved",
  });

  if (!rpcError && rpcData && rpcData.length > 0) {
    const results = (rpcData ?? []).map((r: Record<string, unknown>) => ({
      id: r.ticket_id,
      subject: r.subject,
      resolved_at: r.resolved_at,
      resolution_summary: r.resolution_summary ?? null,
      ticket_number: r.ticket_number,
      similarity: r.similarity,
    }));
    return c.json({ data: results });
  }

  // Fallback: full-text — same sender OR shared subject words, resolved tickets only
  const keywords = (ticket.subject ?? "")
    .split(/\s+/)
    .filter((w: string) => w.length > 3)
    .slice(0, 5);

  let fallbackQuery = supabase
    .from("tickets")
    .select("id, subject, resolved_at, resolution_summary, ticket_number")
    .eq("account_id", ctx.accountId)
    .eq("status", "resolved")
    .neq("id", id)
    .limit(3);

  if (ticket.from_email) {
    fallbackQuery = fallbackQuery.eq("from_email", ticket.from_email);
  } else if (keywords.length > 0) {
    fallbackQuery = fallbackQuery.ilike("subject", `%${keywords[0]}%`);
  }

  const { data: fallbackData } = await fallbackQuery;

  const results = (fallbackData ?? []).map((r) => ({
    id: r.id,
    subject: r.subject,
    resolved_at: r.resolved_at ?? null,
    resolution_summary: r.resolution_summary ?? null,
    ticket_number: r.ticket_number,
    similarity: null,
  }));

  return c.json({ data: results });
});

// ---------------------------------------------------------------------------
// GET /v1/tickets/:id/similar — semantic similarity (KAI-20)
// Gracefully returns [] when pgvector RPC is unavailable
// ---------------------------------------------------------------------------

const SIMILAR_TICKETS_THRESHOLD = 0.85;

tickets.get("/:id/similar", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit") ?? 5), 20);

  // Verify ticket belongs to user
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .single();

  if (ticketErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  // Call pgvector RPC — degrade gracefully if extension/function not yet deployed.
  // p_exclude_same_group: suggestions are for grouping, so tickets already in
  // the caller's group must never come back (KAI-108).
  const { data, error } = await supabase.rpc("find_similar_tickets", {
    p_ticket_id: id,
    p_account_id: ctx.accountId,
    p_limit: limit,
    p_threshold: SIMILAR_TICKETS_THRESHOLD,
    p_exclude_same_group: true,
  });

  if (error) {
    // RPC missing (42883) or pgvector not installed — not a hard failure
    return c.json({ data: [], degraded: true });
  }

  return c.json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// POST /v1/tickets/:id/classify — single-ticket manual classify (KAI-7)
// Emits ai_classified (API call = autonomous AI) or human_classified when
// the request carries ?source=human query param.
// ---------------------------------------------------------------------------

tickets.post("/:id/classify", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);
  const user = { id: ctx.userId };

  const id = c.req.param("id");
  const source = c.req.query("source") === "human" ? "human" : "ai";

  const { data: ticket, error: fetchError } = await supabase
    .from("tickets")
    .select("id, subject, body_plain, from_email")
    .eq("id", id)
    .single();

  if (fetchError || !ticket) {
    return c.json({ error: "Ticket not found" }, 404);
  }

  let classification;
  const llmStart = Date.now();
  try {
    const { result, meta, prompt, promptVersion } = await classifyEmailWithMeta({
      subject: ticket.subject,
      body: ticket.body_plain ?? "",
      from: ticket.from_email,
    });
    classification = result;

    logLlmCall({
      feature: "email_classification",
      model: meta.model,
      promptVersion,
      promptText: prompt,
      responseText: meta.rawText,
      promptTokens: meta.usage.promptTokens,
      completionTokens: meta.usage.completionTokens,
      confidenceScore: classification.confidence,
      latencyMs: Date.now() - llmStart,
      triggeredByUserId: user.id,
      accountId: ctx.accountId,
      ticketId: id,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logLlmCall({
      feature: "email_classification",
      model: resolveModelVersion(),
      promptText: `${ticket.from_email} | ${ticket.subject}`,
      latencyMs: Date.now() - llmStart,
      errorCode: "LLM_ERROR",
      errorDetail: detail,
      triggeredByUserId: user.id,
      accountId: ctx.accountId,
      ticketId: id,
    });
    return c.json(
      {
        error: "Classification failed",
        detail,
      },
      500
    );
  }

  const classified_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("tickets")
    .update({
      ticket_type: classification.type,
      priority: classification.priority,
      category: classification.category,
      sentiment: classification.tone,
      ai_reasoning: classification.reasoning,
      classification_confidence: classification.confidence,
      classified_at,
      classification_tier: 1,
    })
    .eq("id", id);

  if (updateError) {
    return c.json(
      {
        error: "Classification failed",
        detail: updateError.message,
      },
      500
    );
  }

  await emitTicketEvent({
    ticketId: id,
    authorId: source === "human" ? user.id : null,
    eventType: source === "human" ? "human_classified" : "ai_classified",
    metadata: { type: classification.type, priority: classification.priority },
  });

  return c.json({
    ticket_id: id,
    classification,
    classified_at,
    tier: 1,
  });
});

// ---------------------------------------------------------------------------
// POST /v1/tickets/classify-batch — batch manual classify (KAI-8)
// ---------------------------------------------------------------------------

tickets.post("/classify-batch", async (c) => {
  // Parse and validate request body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = ClassifyBatchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);
  }

  const { ticket_ids, force_reclassify } = parsed.data;

  // Resolve account context (ADR-022)
  const batchCtx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!batchCtx) return c.json({ error: "Unauthorized" }, 401);
  const userId    = batchCtx.userId;
  const accountId = batchCtx.accountId;

  // -------------------------------------------------------------------------
  // Async path — dispatch to Inngest, return job_id immediately
  // -------------------------------------------------------------------------
  if (ticket_ids.length > env.BATCH_SYNC_LIMIT) {
    const { data: jobRow, error: jobError } = await supabase
      .from("batch_classify_jobs")
      .insert({
        user_id: userId,
        status: "queued",
        total: ticket_ids.length,
        ticket_ids,
        force_reclassify,
      })
      .select("id")
      .single();

    if (jobError || !jobRow) {
      return c.json({ error: "Failed to create job" }, 500);
    }

    await inngest.send({
      name: "tickets/batch-classify.triggered",
      data: {
        userId,
        ticketIds: ticket_ids,
        forceReclassify: force_reclassify,
        jobId: jobRow.id,
      },
    });

    return c.json({
      mode: "async",
      job_id: jobRow.id,
      status: "queued",
      total: ticket_ids.length,
    });
  }

  // -------------------------------------------------------------------------
  // Sync path — process inline
  // -------------------------------------------------------------------------

  // Step 1: Fetch tickets scoped to this user
  const { data: dbTickets } = await supabase
    .from("tickets")
    .select("id, subject, body_plain, from_email, classified_at")
    .in("id", ticket_ids)
    .eq("account_id", accountId);

  const tickets_found = dbTickets ?? [];
  const foundIds = new Set(tickets_found.map((t) => t.id));

  // Step 2: Check human corrections for force-reclassify tickets
  let protectedSet = new Set<string>();
  if (force_reclassify) {
    const candidates = ticket_ids.filter((id) => foundIds.has(id));
    if (candidates.length > 0) {
      const { data: feedbackRows } = await supabase
        .from("classification_feedback")
        .select("ticket_id")
        .in("ticket_id", candidates);
      protectedSet = new Set((feedbackRows ?? []).map((r) => r.ticket_id));
    }
  }

  // Step 3 & 4: Evaluate each ticket
  const results: BatchTicketResult[] = [];

  // Not-found entries
  for (const id of ticket_ids) {
    if (!foundIds.has(id)) {
      results.push({ ticket_id: id, status: "failed", reason: "not_found" });
    }
  }

  for (const ticket of tickets_found) {
    // Protected by human correction
    if (protectedSet.has(ticket.id)) {
      results.push({
        ticket_id: ticket.id,
        status: "protected",
        reason: "human_correction_exists",
      });
      continue;
    }

    // Already classified — skip unless forcing
    if (!force_reclassify && ticket.classified_at !== null) {
      results.push({
        ticket_id: ticket.id,
        status: "skipped",
        reason: "already_classified",
      });
      continue;
    }

    // Classify
    const llmStart = Date.now();
    try {
      const { result: classification, meta, prompt, promptVersion } = await classifyEmailWithMeta({
        subject: ticket.subject,
        body: ticket.body_plain ?? "",
        from: ticket.from_email,
      });

      logLlmCall({
        feature: "email_classification",
        model: meta.model,
        promptVersion,
        promptText: prompt,
        responseText: meta.rawText,
        promptTokens: meta.usage.promptTokens,
        completionTokens: meta.usage.completionTokens,
        confidenceScore: classification.confidence,
        latencyMs: Date.now() - llmStart,
        triggeredByUserId: userId,
        accountId,
        ticketId: ticket.id,
      });

      const classified_at = new Date().toISOString();

      await supabase
        .from("tickets")
        .update({
          ticket_type: classification.type,
          priority: classification.priority,
          category: classification.category,
          sentiment: classification.tone,
          ai_reasoning: classification.reasoning,
          classification_confidence: classification.confidence,
          classified_at,
        })
        .eq("id", ticket.id);

      results.push({ ticket_id: ticket.id, status: "success", classification });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      logLlmCall({
        feature: "email_classification",
        model: resolveModelVersion(),
        promptText: `${ticket.from_email} | ${ticket.subject}`,
        latencyMs: Date.now() - llmStart,
        errorCode: "LLM_ERROR",
        errorDetail: detail,
        triggeredByUserId: userId,
        accountId,
        ticketId: ticket.id,
      });
      results.push({
        ticket_id: ticket.id,
        status: "failed",
        reason: detail,
      });
    }
  }

  const processed = results.filter((r) => r.status === "success").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const protectedCount = results.filter((r) => r.status === "protected").length;
  const failed = results.filter((r) => r.status === "failed").length;

  return c.json({
    mode: "sync",
    total: ticket_ids.length,
    processed,
    skipped,
    protected: protectedCount,
    failed,
    results,
  });
});

// ---------------------------------------------------------------------------
// GET /v1/tickets/:id/activity — activity feed (KAI-28)
// Returns ticket_events newest first, paginated by cursor.
// TODO: restrict to agent/support roles only once role/permission system exists.
// ---------------------------------------------------------------------------

tickets.get("/:id/activity", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
  const cursor = c.req.query("cursor");

  // Verify ticket belongs to user (tenant isolation)
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .single();

  if (ticketErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  let query = supabase
    .from("ticket_events")
    .select("*")
    .eq("ticket_id", id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit);

  if (cursor) {
    try {
      const { created_at, id: cursorId } = JSON.parse(atob(cursor)) as { created_at: string; id: string };
      query = query.or(`created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${cursorId})`);
    } catch {
      return c.json({ error: "Invalid cursor" }, 400);
    }
  }

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);

  const items = data ?? [];
  const last = items.at(-1);
  const nextCursor =
    items.length === limit && last
      ? btoa(JSON.stringify({ created_at: last.created_at, id: last.id }))
      : null;

  return c.json({ events: items, next_cursor: nextCursor, count: items.length });
});

// ---------------------------------------------------------------------------
// PATCH /v1/tickets/:id/status — typed state machine transition (KAI-50)
// ---------------------------------------------------------------------------

const UpdateStatusSchema = z.object({
  status: z.enum([
    "open",
    "awaiting_customer",
    "in_progress",
    "resolved",
    "auto_resolved",
    "guided",
    "escalated",
    "reopened",
  ]),
});

tickets.patch("/:id/status", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);
  const user = { id: ctx.userId };

  const id = c.req.param("id");

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = UpdateStatusSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);

  const { data: ticket, error: fetchErr } = await supabase
    .from("tickets")
    .select("id, status")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .single();

  if (fetchErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  const fromStatus: TicketStatus = isTicketStatus(ticket.status ?? "") ? ticket.status as TicketStatus : "open";
  const toStatus = parsed.data.status as TicketStatus;

  if (!isValidTransition(fromStatus, toStatus)) {
    return c.json(
      { error: getTransitionError(fromStatus, toStatus), code: "INVALID_TRANSITION" },
      422
    );
  }

  const { data: updatedTicket, error: updateErr } = await supabase
    .from("tickets")
    .update({ status: toStatus })
    .eq("id", id)
    .select()
    .single();

  if (updateErr) return c.json({ error: updateErr.message }, 500);

  await emitTicketEvent({
    ticketId: id,
    authorId: user.id,
    eventType: "status_change",
    metadata: { from: fromStatus, to: toStatus },
  });

  return c.json({ success: true, ticket: updatedTicket });
});

// ---------------------------------------------------------------------------
// PATCH /v1/tickets/:id/assign — assign ticket to the calling agent (KAI-162)
// ---------------------------------------------------------------------------

tickets.patch("/:id/assign", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);
  const user = { id: ctx.userId };

  const id = c.req.param("id");

  const { data: ticket, error: fetchErr } = await supabase
    .from("tickets")
    .select("id, assigned_to")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .single();

  if (fetchErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  const { data: updatedTicket, error: updateErr } = await supabase
    .from("tickets")
    .update({ assigned_to: user.id })
    .eq("id", id)
    .select()
    .single();

  if (updateErr) return c.json({ error: updateErr.message }, 500);

  await emitTicketEvent({
    ticketId: id,
    authorId: user.id,
    eventType: "assignment",
    metadata: { assigned_to: user.id },
  });

  return c.json({ success: true, ticket: updatedTicket });
});

// ---------------------------------------------------------------------------
// POST /v1/tickets/:id/escalate — escalate ticket (KAI-28)
// ---------------------------------------------------------------------------

const EscalateSchema = z.object({
  reason: z.string().min(1).max(1000).optional(),
});

tickets.post("/:id/escalate", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);
  const user = { id: ctx.userId };

  const id = c.req.param("id");

  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }

  const parsed = EscalateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);

  const { data: ticket, error: fetchErr } = await supabase
    .from("tickets")
    .select("id, status")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .single();

  if (fetchErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  // Transition status to escalated if valid (KAI-221: unify escalate flow)
  const fromStatus: TicketStatus = isTicketStatus(ticket.status ?? "") ? ticket.status as TicketStatus : "open";
  const toEscalated: TicketStatus = "escalated";
  let updatedTicket: Record<string, unknown> | null = null;

  if (fromStatus !== toEscalated && isValidTransition(fromStatus, toEscalated)) {
    const { data, error: updateErr } = await supabase
      .from("tickets")
      .update({ status: toEscalated })
      .eq("id", id)
      .select()
      .single();
    if (!updateErr && data) {
      updatedTicket = data as Record<string, unknown>;
      await emitTicketEvent({
        ticketId: id,
        authorId: user.id,
        eventType: "status_change",
        metadata: { from: fromStatus, to: toEscalated, trigger: "escalate_action" },
      });
    }
  }

  // Emit escalated event with reason
  await emitTicketEvent({
    ticketId: id,
    authorId: user.id,
    eventType: "escalated",
    body: parsed.data.reason ?? undefined,
    isInternal: true,
  });

  return c.json({ ticket_id: id, escalated: true, ticket: updatedTicket });
});

// ---------------------------------------------------------------------------
// POST /v1/tickets/:id/notes — add an internal note (KAI-221)
// Internal notes are visible only to agents. Stored as ticket_events with
// event_type=internal_note, is_internal=true. Also returned as a synthetic
// ThreadMessage so the UI can append it optimistically.
// ---------------------------------------------------------------------------

const InternalNoteSchema = z.object({
  body: z.string().min(1).max(50000),
});

tickets.post("/:id/notes", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);
  const user = { id: ctx.userId };

  const id = c.req.param("id");

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = InternalNoteSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);

  const { data: ticket, error: fetchErr } = await supabase
    .from("tickets")
    .select("id")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .single();

  if (fetchErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  // Fetch agent display name for the synthetic message
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name, email")
    .eq("id", user.id)
    .single();

  const agentName = (profile as { full_name?: string; email?: string } | null)?.full_name ?? null;
  const agentEmail = (profile as { full_name?: string; email?: string } | null)?.email ?? null;

  const now = new Date().toISOString();

  // Insert note into ticket_events
  const { data: eventRow, error: insertErr } = await supabase
    .from("ticket_events")
    .insert({
      ticket_id: id,
      author_id: user.id,
      event_type: "internal_note",
      body: parsed.data.body,
      is_internal: true,
    })
    .select("id, created_at")
    .single();

  if (insertErr || !eventRow) {
    return c.json({ error: insertErr?.message ?? "Failed to insert note" }, 500);
  }

  // Return a ThreadMessage-shaped object (direction="internal") so the UI
  // can append it to the thread without a full reload.
  const note = {
    id: (eventRow as { id: string; created_at: string }).id,
    direction: "internal" as const,
    sender_external_id: agentEmail,
    sender_display_name: agentName,
    body_plain: parsed.data.body,
    body_html: null,
    snippet: parsed.data.body.substring(0, 120),
    received_at: (eventRow as { id: string; created_at: string }).created_at ?? now,
    is_origin: false,
    delivery_status: null,
    send_error: null,
  };

  return c.json({ success: true, note }, 201);
});

// ---------------------------------------------------------------------------
// POST /v1/tickets/:id/reply — send reply via Gmail + record message (KAI-29)
// Resolves thread from conversations.external_thread_id (omnichannel design).
// Fallback to tickets.gmail_thread_id for legacy tickets not yet linked to a
// conversation (deprecated column per 003_kairo_core_schema).
// Token source: oauth_credentials (see gmail-token.ts).
// deferred multi-account / omnichannel token abstraction note).
// ---------------------------------------------------------------------------

const ReplySchema = z.object({
  body: z.string().min(1),
  bodyMarkdown: z.string().optional(),
  templateId: z.string().uuid().optional(),
  intent: z.enum(["reply", "resolve"]).default("reply"),
});

tickets.post("/:id/reply", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);
  const user = { id: ctx.userId };

  const id = c.req.param("id");

  let reqBody: unknown;
  try { reqBody = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = ReplySchema.safeParse(reqBody);
  if (!parsed.success) return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);

  // 1. Fetch ticket + linked conversation (ticket_number for traceability token)
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, ticket_number, subject, from_email, gmail_thread_id, conversation_id, status, account_id, created_at, first_response_at")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .single();

  if (ticketErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  // KAI-247: "Enviar y resolver" transitions the ticket to `resolved` atomically
  // with the enqueue. Validate the transition up front so an invalid resolve
  // never queues an email or touches ticket state.
  const intent = parsed.data.intent;
  if (intent === "resolve") {
    const fromStatus: TicketStatus = isTicketStatus(ticket.status ?? "") ? (ticket.status as TicketStatus) : "open";
    if (!isValidTransition(fromStatus, "resolved")) {
      return c.json(
        { error: getTransitionError(fromStatus, "resolved"), code: "INVALID_TRANSITION" },
        422,
      );
    }
  }

  // 2. Resolve Gmail thread ID: prefer omnichannel path, fall back to legacy column
  let threadId: string | null = null;
  let channelIntegrationId: string | null = null;

  if (ticket.conversation_id) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("external_thread_id, channel_integration_id")
      .eq("id", ticket.conversation_id)
      .single();
    threadId = conv?.external_thread_id ?? null;
    channelIntegrationId = conv?.channel_integration_id ?? null;
  }

  // Legacy fallback
  if (!threadId) threadId = ticket.gmail_thread_id ?? null;

  if (!threadId) {
    return c.json({ error: "No Gmail thread found for this ticket", code: "NO_THREAD" }, 422);
  }

  // KAI-165: If ticket doesn't have conversation_id yet, upsert it now
  if (!ticket.conversation_id && channelIntegrationId && threadId) {
    try {
      const { conversation_id } = await upsertConversationByThread(supabase, {
        accountId: ticket.account_id,
        channelIntegrationId,
        externalThreadId: threadId,
        customerExternalId: ticket.from_email ?? "",
        customerDisplayName: null,
      });
      await supabase.from("tickets").update({ conversation_id }).eq("id", ticket.id);
      ticket.conversation_id = conversation_id;
    } catch (convErr) {
      console.warn(`[reply] failed to upsert conversation for ticket ${ticket.id}:`, convErr);
    }
  } else if (!channelIntegrationId && threadId) {
    // Try to resolve channelIntegrationId from account
    const { data: ciRow } = await supabase
      .from("channel_integrations")
      .select("id")
      .eq("account_id", ticket.account_id)
      .eq("provider", "gmail")
      .limit(1)
      .maybeSingle();
    channelIntegrationId = ciRow?.id ?? null;

    if (channelIntegrationId && !ticket.conversation_id) {
      try {
        const { conversation_id } = await upsertConversationByThread(supabase, {
          accountId: ticket.account_id,
          channelIntegrationId,
          externalThreadId: threadId,
          customerExternalId: ticket.from_email ?? "",
          customerDisplayName: null,
        });
        await supabase.from("tickets").update({ conversation_id }).eq("id", ticket.id);
        ticket.conversation_id = conversation_id;
      } catch (convErr) {
        console.warn(`[reply] failed to upsert conversation (late resolve) for ticket ${ticket.id}:`, convErr);
      }
    }
  }

  // 3. Resolve Gmail OAuth identity from oauth_credentials (ADR-022 canonical).
  // The worker fetches a fresh token at send time — here we only need to know
  // an integration exists and which mailbox the reply is "From".
  let gmailFromEmail: string | null = null;

  if (ticket.account_id) {
    const { data: cred } = await supabase
      .from("oauth_credentials")
      .select("access_token_enc, external_account_id")
      .eq("account_id", ticket.account_id)
      .eq("provider", "gmail")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cred?.access_token_enc) {
      gmailFromEmail = cred.external_account_id;
    }
  }

  if (!gmailFromEmail || !channelIntegrationId) {
    return c.json({ error: "No Gmail integration found", code: "NO_GMAIL_INTEGRATION" }, 422);
  }

  // 4. Outbox: persist the message FIRST as `queued` — never send-then-persist
  // (ADR-023 §1). The worker (messages/outbound.queued) drives the actual send.
  //
  // KAI-115: Before persisting, resolve template vars, inject signature + branding,
  // and append the [KAIRO-<shortid>] traceability token. Also look up the RFC 2822
  // Message-ID of the last inbound message for In-Reply-To / References headers.

  // Resolve base subject, then append traceability token (KAI-115 §B).
  // Token uses the human-visible ticket_number (KAI-453), not a UUID fragment.
  const baseSubject = ticket.subject?.startsWith("Re:") ? ticket.subject : `Re: ${ticket.subject ?? ""}`;
  const ticketNumber = (ticket as { ticket_number: number }).ticket_number;
  const subject = appendKairoToken(baseSubject, ticketNumber);

  // Fetch account signature (plain body footer)
  const { data: account } = await supabase
    .from("accounts")
    .select("signature_plain")
    .eq("id", ticket.account_id)
    .maybeSingle();

  // Fetch customer display name from conversation
  let customerDisplayName: string | null = null;
  if (ticket.conversation_id) {
    const { data: conv } = await supabase
      .from("conversations")
      .select("customer_display_name")
      .eq("id", ticket.conversation_id)
      .maybeSingle();
    customerDisplayName = conv?.customer_display_name ?? null;
  }

  // Fetch RFC 2822 Message-ID from the most recent inbound message for threading (KAI-115 §A)
  let inReplyToExternalId: string | undefined;
  let lastInboundMessage: { body_plain: string | null; snippet: string | null } | null = null;
  if (ticket.conversation_id) {
    const { data: lastInbound } = await supabase
      .from("messages")
      .select("message_id_header, body_plain, snippet")
      .eq("conversation_id", ticket.conversation_id)
      .eq("direction", "inbound")
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    inReplyToExternalId = lastInbound?.message_id_header ?? undefined;
    lastInboundMessage = lastInbound ?? null;
  }

  // Build template variables (KAI-115 §C)
  const templateVars: Partial<TemplateVars> = {
    "cliente.nombre": customerDisplayName ?? "",
    "cliente.email": ticket.from_email ?? "",
    "ticket.id": `KAI-${ticketNumber}`,
    "ticket.asunto": ticket.subject ?? "",
    "agente.email": gmailFromEmail ?? "",
    "agente.nombre": gmailFromEmail ?? "",
    firma: account?.signature_plain ?? "",
  };

  const rawBody = parsed.data.body;
  const resolvedBody = resolveTemplateVars(rawBody, templateVars);

  const kairoToken = buildKairoToken(ticketNumber);
  const finalBodyPlain = buildPlainBody({
    body: resolvedBody,
    kairoToken,
    signaturePlain: account?.signature_plain ?? null,
  });

  const nowIso = new Date().toISOString();

  // KAI-247: render the design system templates instead of the generic wrapper.
  const emailUrls = await resolveEmailUrls({
    accountId: ticket.account_id,
  });
  const { agent_name, agent_role, agent_initials } = await resolveAgentIdentity(
    supabase,
    user.id,
    gmailFromEmail,
  );
  const emailBaseVars = {
    customer_name: customerDisplayName ?? (ticket.from_email?.split("@")[0] ?? ""),
    ticket_id: `KAI-${ticketNumber}`,
    ticket_subject: ticket.subject ?? "",
    ...emailUrls,
  };
  const bodyHtmlContent = parsed.data.bodyMarkdown
    ? resolveTemplateVars(parsed.data.bodyMarkdown, templateVars)
    : plainToHtmlParagraphs(resolvedBody);

  let finalBodyHtml: string;
  if (intent === "resolve") {
    const messageCountBefore = await countTicketMessages(supabase, ticket.id);
    finalBodyHtml = renderResolved({
      ...emailBaseVars,
      agent_name,
      agent_initials,
      resolution_summary: bodyHtmlContent,
      resolved_at: formatEmailDate(nowIso),
      time_to_resolve: humanizeDuration(ticket.created_at, nowIso),
      message_count: messageCountBefore + 1,
      csat_url: "",
      reopen_url: "",
    });
  } else {
    finalBodyHtml = renderAgentReply({
      ...emailBaseVars,
      agent_name,
      agent_role,
      agent_initials,
      agent_message: bodyHtmlContent,
      sent_at: formatEmailDate(nowIso),
      original_message: plainToHtmlParagraphs(lastInboundMessage?.body_plain ?? lastInboundMessage?.snippet ?? ""),
    });
  }

  const { data: outboundMsg, error: insertErr } = await supabase
    .from("messages")
    .insert({
      account_id: ticket.account_id,
      conversation_id: ticket.conversation_id,
      channel_integration_id: channelIntegrationId,
      external_id: null,
      thread_external_id: threadId,
      direction: "outbound",
      delivery_status: "queued",
      sender_external_id: gmailFromEmail,
      sender_display_name: gmailFromEmail,
      body_plain: finalBodyPlain,
      body_html: finalBodyHtml,
      snippet: resolvedBody.slice(0, 200),
      raw_payload: {},
      received_at: nowIso,
    })
    .select("id, direction, sender_external_id, sender_display_name, body_plain, body_html, snippet, received_at, delivery_status")
    .single();

  if (insertErr || !outboundMsg) {
    return c.json({ error: "Failed to queue reply", code: "QUEUE_FAILED" }, 500);
  }

  await linkMessageToTicket(supabase, {
    ticket_id: ticket.id,
    message_id: outboundMsg.id,
    is_origin: false,
  });

  // 5. Enqueue the send — endpoint never talks to the provider directly (ADR-023 §2/§3).
  await inngest.send({
    name: "messages/outbound.queued",
    data: {
      messageId: outboundMsg.id,
      ticketId: ticket.id,
      accountId: ticket.account_id,
      provider: "gmail",
      to: ticket.from_email ?? "",
      subject,
      bodyPlain: finalBodyPlain,
      bodyHtml: finalBodyHtml,
      threadExternalId: threadId,
      ...(inReplyToExternalId ? { inReplyToExternalId } : {}),
    },
  });

  // 6. Update ticket: last_response_at + status transition.
  // Optimistic — the agent has responded; delivery is tracked independently via delivery_status.
  const currentStatus = ticket.status ?? "open";
  // Replying means "now waiting on the customer" — applies to any active state
  // (incl. reopened, KAI-221), not just open/in_progress. Resolved/awaiting are
  // intentionally excluded.
  const AUTO_AWAITING_SOURCES: TicketStatus[] = ["open", "in_progress", "reopened"];
  const shouldTransitionToAwaiting =
    intent === "reply" && isTicketStatus(currentStatus) && AUTO_AWAITING_SOURCES.includes(currentStatus as TicketStatus);

  // KAI-247: "Enviar y resolver" transitions to `resolved` atomically with the enqueue.
  const finalStatus: string = intent === "resolve" ? "resolved" : shouldTransitionToAwaiting ? "awaiting_customer" : currentStatus;

  await supabase
    .from("tickets")
    .update({
      last_response_at: nowIso,
      // KAI-168 — first agent response freezes the operational SLA clock.
      ...(ticket.first_response_at ? {} : { first_response_at: nowIso }),
      ...(finalStatus !== currentStatus ? { status: finalStatus } : {}),
    })
    .eq("id", id);

  // 7. Emit activity event
  await emitTicketEvent({
    ticketId: id,
    authorId: user.id,
    eventType: "reply_sent",
    body: parsed.data.body,
    metadata: { message_id: outboundMsg.id, delivery_status: "queued" },
  });

  if (finalStatus !== currentStatus) {
    await emitTicketEvent({
      ticketId: id,
      authorId: user.id,
      eventType: "status_change",
      metadata: { from: currentStatus, to: finalStatus, trigger: intent === "resolve" ? "reply_resolve" : "reply_sent" },
    });
  }

  return c.json(
    {
      success: true,
      messageId: outboundMsg.id,
      deliveryStatus: "queued",
      message: outboundMsg,
      status: finalStatus,
    },
    202,
  );
});

// ---------------------------------------------------------------------------
// GET /v1/tickets/:id/messages — load thread messages (KAI-165)
// ---------------------------------------------------------------------------

tickets.get("/:id/messages", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");

  // Verify ownership
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .single();

  if (ticketErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  // Load messages via ticket_messages join, ordered by received_at ascending
  const { data, error } = await supabase
    .from("ticket_messages")
    .select(`
      is_origin,
      messages (
        id, direction, sender_external_id, sender_display_name,
        body_plain, body_html, snippet, received_at,
        delivery_status, send_error
      )
    `)
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 500);

  const messages: Record<string, unknown>[] = (data ?? [])
    .map((row) => ({
      ...(row.messages as unknown as Record<string, unknown>),
      is_origin: row.is_origin,
    } as Record<string, unknown>))
    .filter((m) => Boolean(m["id"])); // skip orphans

  // Fetch internal notes from ticket_events and merge into thread (KAI-221)
  const { data: noteEvents } = await supabase
    .from("ticket_events")
    .select("id, author_id, body, created_at")
    .eq("ticket_id", id)
    .eq("event_type", "internal_note")
    .order("created_at", { ascending: true });

  if (noteEvents && noteEvents.length > 0) {
    // Resolve author names in one query
    const authorIds = [...new Set((noteEvents as { author_id: string | null }[]).map((e) => e.author_id).filter(Boolean))] as string[];
    const { data: profiles } = authorIds.length
      ? await supabase.from("user_profiles").select("id, full_name, email").in("id", authorIds)
      : { data: [] };
    const profileMap = Object.fromEntries(
      ((profiles ?? []) as { id: string; full_name?: string; email?: string }[]).map((p) => [p.id, p])
    );

    for (const evt of noteEvents as { id: string; author_id: string | null; body: string | null; created_at: string }[]) {
      const profile = evt.author_id ? profileMap[evt.author_id] : null;
      messages.push({
        id: evt.id,
        direction: "internal",
        sender_external_id: profile?.email ?? null,
        sender_display_name: profile?.full_name ?? null,
        body_plain: evt.body,
        body_html: null,
        snippet: evt.body?.substring(0, 120) ?? null,
        received_at: evt.created_at,
        is_origin: false,
        delivery_status: null,
        send_error: null,
      });
    }
    // Re-sort merged timeline by received_at ascending
    messages.sort((a, b) =>
      String(a.received_at ?? "").localeCompare(String(b.received_at ?? ""))
    );
  }

  return c.json({ messages, count: messages.length });
});

// ---------------------------------------------------------------------------
// POST /v1/tickets/:id/classify-approve — approve or reject AI proposal (KAI-28)
// ---------------------------------------------------------------------------

const ClassifyApproveSchema = z.object({
  proposal_id: z.string().uuid(),
  action: z.enum(["confirm", "reject"]),
});

tickets.post("/:id/classify-approve", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);
  const user = { id: ctx.userId };

  const id = c.req.param("id");

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = ClassifyApproveSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);

  const { data: ticket, error: fetchErr } = await supabase
    .from("tickets")
    .select("id")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .single();

  if (fetchErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  const { error: proposalErr } = await supabase
    .from("ticket_proposals")
    .update({
      status: parsed.data.action === "confirm" ? "confirmed" : "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq("id", parsed.data.proposal_id)
    .eq("ticket_id", id);

  if (proposalErr) return c.json({ error: proposalErr.message }, 500);

  await emitTicketEvent({
    ticketId: id,
    authorId: user.id,
    eventType: parsed.data.action === "confirm" ? "ai_confirmed" : "ai_rejected",
    metadata: { proposal_id: parsed.data.proposal_id },
  });

  return c.json({ ticket_id: id, proposal_id: parsed.data.proposal_id, action: parsed.data.action });
});

// ---------------------------------------------------------------------------
// POST /v1/tickets/:id/suggest-reply — context-aware reply suggestion (KAI-31)
// Assembles 5 context sources, calls Claude, stores in ticket_proposals.
// All context sources degrade gracefully — partial context is better than no call.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPT_DIR = join(__dirname, "../../../../packages/intelligence/prompts/reply-suggestion");

function loadPromptTemplate(lang: "es" | "en"): string {
  try {
    return readFileSync(join(PROMPT_DIR, `${lang}.md`), "utf-8");
  } catch {
    return readFileSync(join(PROMPT_DIR, "es.md"), "utf-8");
  }
}

function detectLanguage(texts: string[]): "es" | "en" {
  const sample = texts.join(" ").toLowerCase().slice(0, 2000);
  const esSignals = (sample.match(/\b(hola|gracias|por favor|necesito|tengo|problema|ayuda|buenas|estimado)\b/g) ?? []).length;
  const enSignals = (sample.match(/\b(hello|thank|please|need|have|problem|help|dear|hi|issue)\b/g) ?? []).length;
  return enSignals > esSignals ? "en" : "es";
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replaceAll(`{{${k}}}`, v),
    template
  );
}

const SuggestReplyResponseSchema = z.object({
  suggestion: z.string(),
  confidence: z.number().min(0).max(1),
  detected_language: z.enum(["es", "en"]),
});

tickets.post("/:id/suggest-reply", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");

  // 1. Ticket — required; fail hard only here
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, subject, ticket_type, priority, category, emotion, conversation_id, client_id, from_email")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .single();

  if (ticketErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  // 2. Message history — graceful degrade
  let messageHistory = "No hay historial de mensajes disponible.";
  if (ticket.conversation_id) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("direction, sender_display_name, body_plain, received_at")
      .eq("conversation_id", ticket.conversation_id)
      .order("received_at", { ascending: false })
      .limit(10);

    if (msgs && msgs.length > 0) {
      messageHistory = msgs
        .reverse()
        .map((m) => `[${m.direction === "inbound" ? "Cliente" : "Agente"} — ${m.received_at}]\n${m.body_plain ?? ""}`)
        .join("\n\n");
    }
  }

  // 3. Client profile — graceful degrade
  let clientProfile = "Sin perfil de cliente disponible.";
  if (ticket.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("name, plan_type, sla_level")
      .eq("id", ticket.client_id)
      .single();

    if (client) {
      clientProfile = `Nombre: ${client.name} | Plan: ${client.plan_type ?? "N/A"} | SLA: ${client.sla_level ?? "N/A"}`;
    }
  }

  // 4. Similar resolved case — graceful degrade (RPC may not be available)
  let similarCase = "No hay casos similares resueltos disponibles.";
  const { data: similar } = await Promise.resolve(
    supabase.rpc("find_similar_tickets", {
      p_ticket_id: id,
      p_account_id: ctx.accountId,
      p_limit: 1,
      p_status_filter: "resolved",
    }),
  ).catch(() => ({ data: null }));

  if (similar && similar.length > 0) {
    const s = similar[0] as { subject?: string; resolution_summary?: string };
    similarCase = `Asunto: ${s.subject ?? "N/A"}\nResolución: ${s.resolution_summary ?? "Sin resumen"}`;
  }

  // 5. KB articles — graceful degrade (find_relevant_kb RPC not yet implemented — ADR-012 pending)
  // TODO: wire find_relevant_kb() once kb_articles table and pgvector index are built.
  const referencedKbArticles: string[] = [];
  const kbArticlesText = "No hay artículos de base de conocimiento disponibles aún.";

  // Detect language from message history
  const lang = detectLanguage([messageHistory, ticket.subject ?? ""]);
  const promptTemplate = loadPromptTemplate(lang);

  const prompt = fillTemplate(promptTemplate, {
    subject: ticket.subject ?? "",
    ticket_type: ticket.ticket_type ?? "N/A",
    priority: ticket.priority ?? "N/A",
    category: ticket.category ?? "N/A",
    emotion: ticket.emotion ?? "neutral",
    client_profile: clientProfile,
    message_history: messageHistory,
    similar_case: similarCase,
    kb_articles: kbArticlesText,
  });

  // Call Claude
  const provider = createCompletionProvider();
  const promptVersion = extractPromptVersion(promptTemplate);
  let suggestion: string;
  let confidence: number;
  const llmStart = Date.now();
  let meta: Awaited<ReturnType<typeof provider.completeWithMeta>> | null = null;

  try {
    meta = await provider.completeWithMeta(prompt, { maxTokens: 1500, temperature: 0.4 });
    const jsonMatch = meta.rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = SuggestReplyResponseSchema.parse(JSON.parse(jsonMatch[0]));
    suggestion = parsed.suggestion;
    confidence = parsed.confidence;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logLlmCall({
      feature: "reply_suggestion",
      model: meta?.model ?? resolveModelVersion(),
      promptVersion,
      promptText: prompt,
      responseText: meta?.rawText ?? null,
      promptTokens: meta?.usage.promptTokens ?? null,
      completionTokens: meta?.usage.completionTokens ?? null,
      latencyMs: Date.now() - llmStart,
      errorCode: "LLM_ERROR",
      errorDetail: detail,
      triggeredByUserId: ctx.userId,
      accountId: ctx.accountId,
      ticketId: id,
    });
    return c.json(
      { error: "Suggestion failed", detail },
      500
    );
  }

  // KAI-110: awaited insert into llm_calls — we need the row id to return to
  // the client so the agent's eventual outcome (accepted/edited/...) can be
  // written back. Wrapped so a logging failure degrades to llm_call_id: null
  // and never fails the suggestion itself.
  let llmCallId: string | null = null;
  try {
    const { data: llmCall, error: llmCallErr } = await supabase
      .from("llm_calls")
      .insert({
        triggered_by_user_id: ctx.userId,
        account_id: ctx.accountId,
        ticket_id: id,
        feature: "reply_suggestion",
        provider: process.env["INTELLIGENCE_PROVIDER"] ?? "ollama",
        model: meta.model,
        prompt_version: promptVersion,
        prompt_text: prompt,
        response_text: meta.rawText,
        prompt_tokens: meta.usage.promptTokens,
        completion_tokens: meta.usage.completionTokens,
        confidence_score: confidence,
        latency_ms: Date.now() - llmStart,
      })
      .select("id")
      .single();
    if (llmCallErr) console.error("[llm_calls] log failed", llmCallErr.message);
    else llmCallId = llmCall?.id ?? null;
  } catch (err) {
    console.error("[llm_calls] log failed", err instanceof Error ? err.message : String(err));
  }

  // Store in ticket_proposals
  const { data: proposal } = await supabase
    .from("ticket_proposals")
    .insert({
      ticket_id: id,
      conversation_id: ticket.conversation_id ?? null,
      message_ids: [],
      proposed_reply: suggestion,
      referenced_kb_articles: referencedKbArticles,
      confidence_score: confidence,
      model_version: resolveModelVersion(),
      raw_llm_output: { suggestion, confidence, lang },
      status: "pending",
    })
    .select("id")
    .single();

  return c.json({
    suggestion,
    referencedKbArticles,
    confidence,
    proposal_id: proposal?.id ?? null,
    llm_call_id: llmCallId,
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/tickets/:id/suggest-reply/:llmCallId/outcome — record agent
// outcome on a logged LLM call (accepted/edited/rejected/ignored/auto_applied).
// (KAI-110)
// ---------------------------------------------------------------------------

const LlmCallOutcomeSchema = z.object({
  outcome: z.enum(["accepted", "edited", "rejected", "ignored", "auto_applied"]),
});

tickets.patch("/:id/suggest-reply/:llmCallId/outcome", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const llmCallId = c.req.param("llmCallId");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = LlmCallOutcomeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);
  }

  const { data, error } = await supabase
    .from("llm_calls")
    .update({
      outcome: parsed.data.outcome,
      outcome_recorded_at: new Date().toISOString(),
    })
    .eq("id", llmCallId)
    .eq("account_id", ctx.accountId)
    .select("id")
    .maybeSingle();

  if (error) return c.json({ error: error.message }, 500);
  if (!data) return c.json({ error: "LLM call not found" }, 404);

  return c.json({ id: data.id, outcome: parsed.data.outcome });
});

// ---------------------------------------------------------------------------
// GET /v1/tickets/:id/client-profile — client profile card (KAI-39)
// Resolves client via tickets.client_id. Returns 404 if no client linked.
// Response cached 60s per user+client pair.
// ---------------------------------------------------------------------------

type ClientProfileCache = {
  data: unknown;
  expiresAt: number;
};
const profileCache = new Map<string, ClientProfileCache>();
const PROFILE_CACHE_TTL_MS = 60_000;

tickets.get("/:id/client-profile", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);
  const user = { id: ctx.userId };

  const ticketId = c.req.param("id");

  // 1. Fetch ticket to verify ownership and get client_id
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, client_id, from_email")
    .eq("id", ticketId)
    .eq("account_id", ctx.accountId)
    .single();

  if (ticketErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  // KAI-227 — Fallback to draft_contact when the ticket has no CRM client linked.
  // The contact extraction worker (KAI-225) creates draft_contact rows from
  // `from_email`. We surface that draft so the right-panel "Cliente" tab shows
  // SOMETHING actionable instead of "no disponible".
  if (!ticket.client_id) {
    if (!ticket.from_email) {
      return c.json({ error: "No client linked to this ticket" }, 404);
    }
    const { data: draft } = await supabase
      .from("draft_contact")
      .select("id, email, phone, display_name, organization, status, evidence_count, first_seen_at")
      .eq("account_id", ctx.accountId)
      .eq("email", ticket.from_email.toLowerCase())
      .in("status", ["proposed", "confirmed"])
      .maybeSingle();

    if (!draft) return c.json({ error: "No client or draft contact for this ticket" }, 404);

    const draftProfile = {
      clientId:          `draft:${draft.id}`,
      source:            "draft" as const,
      draftId:           draft.id,
      draftStatus:       draft.status as "proposed" | "confirmed" | "rejected",
      name:              draft.display_name ?? null,
      email:             draft.email ?? ticket.from_email ?? null,
      phone:             draft.phone ?? null,
      organization:      draft.organization ?? null,
      clientType:        "unknown" as const,
      activePlan:        null,
      planScore:         0,
      clientSince:       draft.first_seen_at ?? null,
      isNewClient:       true,
      isRecurrent:       false,
      totalTickets:      draft.evidence_count ?? 0,
      ticketsLast30Days: 0,
      recentTickets:     [],
      slaBreachedCount:  0,
    };

    // Cache by draft id to avoid re-querying on tab switches.
    const draftCacheKey = `${user.id}:draft:${draft.id}`;
    profileCache.set(draftCacheKey, { data: draftProfile, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
    return c.json(draftProfile);
  }

  // 2. Cache check
  const cacheKey = `${user.id}:${ticket.client_id}`;
  const cached = profileCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return c.json(cached.data);
  }

  // 3. Parallel fetch: client + ticket aggregates
  const now30  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const now90  = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [clientRes, totalRes, last30Res, last90Res, recentRes, slaTicketsRes, slaConfigRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, telephone, authorized_emails, plan_type, sla_level, internal_id, created_at")
      .eq("id", ticket.client_id)
      .eq("account_id", ctx.accountId)
      .single(),

    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("account_id", ctx.accountId)
      .eq("client_id", ticket.client_id),

    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("account_id", ctx.accountId)
      .eq("client_id", ticket.client_id)
      .gte("created_at", now30),

    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("account_id", ctx.accountId)
      .eq("client_id", ticket.client_id)
      .gte("created_at", now90),

    supabase
      .from("tickets")
      .select("id, ticket_number, subject, status, created_at")
      .eq("account_id", ctx.accountId)
      .eq("client_id", ticket.client_id)
      .order("created_at", { ascending: false })
      .limit(5),

    // KAI-168 — operational SLA history (own domain, does NOT use tickets.sla_breached).
    supabase
      .from("tickets")
      .select("priority, received_at, created_at, first_response_at, resolved_at")
      .eq("account_id", ctx.accountId)
      .eq("client_id", ticket.client_id),

    supabase
      .from("ticket_priority_sla_config")
      .select("priority, max_response_seconds, min_response_seconds, risk_alert_seconds, escalation_seconds")
      .eq("account_id", ctx.accountId),
  ]);

  if (clientRes.error || !clientRes.data) {
    return c.json({ error: "Client not found" }, 404);
  }

  const client = clientRes.data;
  const totalTickets      = totalRes.count ?? 0;
  const ticketsLast30Days = last30Res.count ?? 0;
  const ticketsLast90Days = last90Res.count ?? 0;
  const recentTickets     = recentRes.data ?? [];

  const { isRecurrent, isNewClient } = computeClientFlags(ticketsLast30Days, ticketsLast90Days);

  // KAI-168 — "X de Y tickets con ANS incumplido" for this client.
  const configByPriority = buildConfigByPriority(slaConfigRes.data ?? []);
  const slaBreachedCount = attachOperationalSla(
    (slaTicketsRes.data ?? []).map((row, i) => ({ id: `${i}`, ...row })),
    configByPriority
  ).filter((t) => t.operational_sla?.status === "breached").length;

  const profile = {
    clientId:        client.id,
    source:          "client" as const,
    name:            client.name,
    email:           client.authorized_emails?.[0] ?? ticket.from_email ?? null,
    phone:           client.telephone ?? null,
    clientType:      normalizePlanTier(client.plan_type) as "enterprise" | "pro" | "starter" | "unknown",
    activePlan:      client.plan_type ?? null,
    planScore:       planScoreFromTier(client.plan_type),
    clientSince:     client.created_at ?? null,
    isNewClient,
    isRecurrent,
    totalTickets,
    ticketsLast30Days,
    recentTickets,
    slaBreachedCount,
  };

  // 4. Cache and return
  profileCache.set(cacheKey, { data: profile, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
  return c.json(profile);
});

// ---------------------------------------------------------------------------
// POST /v1/tickets/:id/escalation-reasons — detect escalation triggers (KAI-41)
// Rule-based detection (no LLM): 4 deterministic rules + pgvector past_l2_case.
// Persists reasons in the latest ticket_proposals row for frontend display.
// Called automatically by tier1-fast-path after classification.
// ---------------------------------------------------------------------------

export async function buildEscalationContext(
  ticketId: string,
  accountId: string,
): Promise<EscalationContext | null> {
  const now7d  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();
  const now30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch ticket fields needed for rule evaluation
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, emotion, sla_breached, sla_due_at, created_at, status, client_id, from_email")
    .eq("id", ticketId)
    .eq("account_id", accountId)
    .single();

  if (ticketErr || !ticket) return null;

  // Resolve planScore from client
  let planScore = 0;
  if (ticket.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("plan_type")
      .eq("id", ticket.client_id)
      .eq("account_id", accountId)
      .single();
    planScore = planScoreFromTier(client?.plan_type ?? null);
  }

  // Parallel counts: tickets last 30d + technical tickets last 7d (same client)
  const [last30Res, tech7Res, similarRes] = await Promise.all([
    ticket.client_id
      ? supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId)
          .eq("client_id", ticket.client_id)
          .gte("created_at", now30d)
      : Promise.resolve({ count: 0 }),

    ticket.client_id
      ? supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("account_id", accountId)
          .eq("client_id", ticket.client_id)
          .eq("category", "technical")
          .gte("created_at", now7d)
      : Promise.resolve({ count: 0 }),

    // past_l2_case: find similar tickets then cross with escalations table
    supabase.rpc("find_similar_tickets", {
      p_ticket_id: ticketId,
      p_account_id: accountId,
      p_limit:     5,
      p_threshold: 0.80,
    }),
  ]);

  // Check if any similar ticket was escalated to L2
  let pastL2CaseFound = false;
  if (!similarRes.error && similarRes.data && similarRes.data.length > 0) {
    const similarIds = (similarRes.data as Array<{ ticket_id: string }>).map((r) => r.ticket_id);
    const { count } = await supabase
      .from("escalations")
      .select("id", { count: "exact", head: true })
      .in("ticket_id", similarIds)
      .gte("escalated_to_level", 2);
    pastL2CaseFound = (count ?? 0) > 0;
  }

  return {
    ticketId,
    emotion:            ticket.emotion ?? null,
    slaBreached:        ticket.sla_breached ?? false,
    slaDueAt:           ticket.sla_due_at ?? null,
    createdAt:          ticket.created_at ?? new Date().toISOString(),
    status:             ticket.status ?? "open",
    planScore,
    ticketsLast30Days:  last30Res.count ?? 0,
    technicalLast7Days: tech7Res.count ?? 0,
    pastL2CaseFound,
  };
}

tickets.post("/:id/escalation-reasons", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const ticketId = c.req.param("id");

  const escCtx = await buildEscalationContext(ticketId, ctx.accountId);
  if (!escCtx) return c.json({ error: "Ticket not found" }, 404);

  const result = detectEscalationTriggers(escCtx);

  // Persist into the latest pending proposal for this ticket
  const { data: proposal } = await supabase
    .from("ticket_proposals")
    .select("id")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (proposal?.id) {
    await supabase
      .from("ticket_proposals")
      .update({ escalation_reasons: result.reasons })
      .eq("id", proposal.id);
  }

  return c.json(result);
});

// ---------------------------------------------------------------------------
// POST /v1/tickets/:id/correct-classification — human correction (KAI-123)
// ---------------------------------------------------------------------------

tickets.post("/:id/correct-classification", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);
  const user = { id: ctx.userId };

  const ticketId = c.req.param("id");

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = CorrectClassificationSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);

  // Load ticket — verify tenant ownership
  const { data: ticket, error: fetchErr } = await supabase
    .from("tickets")
    .select("id, originating_user_id, ticket_type, priority, category, sentiment, classification_confidence, classified_at")
    .eq("id", ticketId)
    .eq("account_id", ctx.accountId)
    .single();

  if (fetchErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  // Snapshot model version from most recent proposal (best-effort)
  const { data: latestProposal } = await supabase
    .from("ticket_proposals")
    .select("model_version")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Insert feedback row
  const { data: feedback, error: insertErr } = await supabase
    .from("classification_feedback")
    .insert({
      ticket_id:        ticketId,
      submitted_by_user_id: user.id,
      corrected_by:     user.id,
      ai_ticket_type:   ticket.ticket_type,
      ai_priority:      ticket.priority,
      ai_category:      ticket.category,
      ai_sentiment:     ticket.sentiment,
      ai_model_version: latestProposal?.model_version ?? null,
      ai_confidence:    ticket.classification_confidence ? Number(ticket.classification_confidence) : null,
      correct_ticket_type: parsed.data.correct_ticket_type ?? null,
      correct_priority:    parsed.data.correct_priority    ?? null,
      correct_category:    parsed.data.correct_category    ?? null,
      correct_sentiment:   parsed.data.correct_sentiment   ?? null,
      notes:               parsed.data.notes               ?? null,
    })
    .select("id")
    .single();

  if (insertErr || !feedback) return c.json({ error: "Failed to save correction" }, 500);

  // Update ticket fields (only the ones provided)
  const ticketPatch: Record<string, string> = {};
  if (parsed.data.correct_ticket_type) ticketPatch.ticket_type = parsed.data.correct_ticket_type;
  if (parsed.data.correct_priority)    ticketPatch.priority    = parsed.data.correct_priority;
  if (parsed.data.correct_category)    ticketPatch.category    = parsed.data.correct_category;
  if (parsed.data.correct_sentiment)   ticketPatch.sentiment   = parsed.data.correct_sentiment;

  const { data: updatedTicket, error: updateErr } = await supabase
    .from("tickets")
    .update(ticketPatch)
    .eq("id", ticketId)
    .select()
    .single();

  if (updateErr) return c.json({ error: "Correction saved but ticket update failed" }, 500);

  await emitTicketEvent({
    ticketId,
    authorId: user.id,
    eventType: "classification_corrected",
    metadata: {
      feedback_id:   feedback.id,
      corrections:   ticketPatch,
    },
  });

  return c.json({ feedback_id: feedback.id, ticket: updatedTicket });
});

// ---------------------------------------------------------------------------
// GET /v1/tickets/:id/knowledge-context — KAI-42
// Returns the right-panel "Artículos" payload:
//   { kbArticles: [...], similarResolvedCases: [...] }
// Primary: pgvector RPC find_relevant_kb (threshold 0.75).
// Fallback: if embedding unavailable or RPC returns 0 results, list all
//   published articles for the user (useful in dev / before embeddings exist).
// Articles are enriched with content + tags from the kb_articles table.
// ---------------------------------------------------------------------------

const KNOWLEDGE_CONTEXT_THRESHOLD = 0.75;
const KB_LIMIT = 3;
const SIMILAR_CASES_LIMIT = 2;
const BODY_PREVIEW_CHARS = 200;

tickets.get("/:id/knowledge-context", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);
  const accountId = ctx.accountId;

  const id = c.req.param("id");

  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, subject, body_plain")
    .eq("id", id)
    .eq("account_id", accountId)
    .single();

  if (ticketErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  // Helper: fetch published articles and optionally enrich with similarity
  async function fetchPublishedArticles(ids?: string[], similarities?: Map<string, number>) {
    const q = supabase
      .from("kb_articles")
      .select("id, title, content, tags")
      .eq("account_id", accountId)
      .eq("is_published", true);

    if (ids && ids.length > 0) {
      q.in("id", ids);
    } else {
      q.limit(KB_LIMIT);
    }

    const { data } = await q;
    return (data ?? []).map((a) => ({
      id:         a.id,
      title:      a.title,
      content:    a.content,
      tags:       a.tags ?? [],
      similarity: similarities?.get(a.id) ?? null,
    }));
  }

  const subject = (ticket.subject ?? "").trim();
  const bodyPreview = (ticket.body_plain ?? "").trim().slice(0, BODY_PREVIEW_CHARS);
  const queryText = [subject, bodyPreview].filter(Boolean).join("\n\n");

  // No text to embed — fall back to listing published articles
  if (queryText.length === 0) {
    const kbArticles = await fetchPublishedArticles();
    return c.json({ kbArticles, similarResolvedCases: [] });
  }

  let queryVector: number[];
  try {
    queryVector = await generateEmbedding(queryText);
  } catch (err) {
    console.error(`[knowledge-context] generateEmbedding failed for ticket ${id}:`, err);
    // Embedding service unavailable — fall back to published list
    const kbArticles = await fetchPublishedArticles();
    return c.json({ kbArticles, similarResolvedCases: [], degraded: true });
  }

  const [kbResult, similarResult] = await Promise.allSettled([
    supabase.rpc("find_relevant_kb", {
      p_query_embedding: queryVector,
      p_account_id: accountId,
      p_limit: KB_LIMIT,
    }),
    supabase.rpc("find_similar_tickets", {
      p_ticket_id: id,
      p_account_id: accountId,
      p_limit: SIMILAR_CASES_LIMIT,
      p_threshold: KNOWLEDGE_CONTEXT_THRESHOLD,
      p_status_filter: "resolved",
    }),
  ]);

  type KbRow = { article_id: string; title: string; similarity: number };
  type SimilarRow = {
    ticket_id: string;
    subject: string | null;
    resolved_at: string | null;
    resolution_summary: string | null;
    ticket_number: number;
    similarity: number;
  };

  // Build similarity map from RPC result
  const rpcRows: KbRow[] =
    kbResult.status === "fulfilled" && !kbResult.value.error
      ? ((kbResult.value.data ?? []) as KbRow[]).filter(
          (r) => r.similarity > KNOWLEDGE_CONTEXT_THRESHOLD,
        )
      : [];

  let kbArticles: Awaited<ReturnType<typeof fetchPublishedArticles>>;
  if (rpcRows.length > 0) {
    const simMap = new Map(rpcRows.map((r) => [r.article_id, r.similarity]));
    kbArticles = await fetchPublishedArticles(rpcRows.map((r) => r.article_id), simMap);
  } else {
    // RPC returned nothing (no embeddings yet) — fall back to published list
    kbArticles = await fetchPublishedArticles();
  }

  const similarResolvedCases =
    similarResult.status === "fulfilled" && !similarResult.value.error
      ? ((similarResult.value.data ?? []) as SimilarRow[]).map((r) => ({
          id: r.ticket_id,
          ticket_number: r.ticket_number,
          subject: r.subject,
          resolved_at: r.resolved_at,
          resolution_summary: r.resolution_summary,
          similarity: r.similarity,
        }))
      : [];

  return c.json({ kbArticles, similarResolvedCases });
});
