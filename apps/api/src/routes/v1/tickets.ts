import { Hono } from "hono";
import { z } from "zod";
import { classifyEmailWithMeta, generateEmbedding, extractPromptVersion } from "@kairo/intelligence";
import { logLlmCall } from "../../lib/llm-logging.js";
import { supabase } from "../../lib/supabase.js";
import { resolveUserAndAccount, resolveMemberRole } from "../../lib/auth.js";
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
import { emitTicketActivity, emitTicketClassification, type ClassificationDimension } from "../../lib/ticket-events.js";
import { fanOutNoteMentions, resolveMentionNames, markOwnMentions } from "../../lib/note-mention-fanout.js";
import { extractMentionUserIds } from "../../lib/note-mentions.js";
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
  isTransitionAllowedForRole,
  getAllowedTransitionsForRole,
  isTicketStatus,
  type TicketStatus,
} from "../../lib/ticket-status-machine.js";
import { checkTransitionPermission } from "../../lib/ticket-transition-permission.js";
import { transitionTicketStatus } from "../../lib/ticket-transition.js";
import { TICKET_STATUSES, RESOLVED_STATUSES } from "@kairo/types";
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
// Primary: pgvector RPC find_similar_tickets filtered to final statuses
// Fallback: full-text match on from_email or subject keywords when RPC unavailable
//
// KAI-108 — "resolved" and "ai_resolved" are both final states (the dashboard
// unified them under the "Resuelto" aside entry and excludes both from triage),
// so historical context must consider both. The RPC takes the list as a
// comma-separated p_status_filter.
// ---------------------------------------------------------------------------

// RESOLVED_STATUSES ("resolved", "ai_resolved") comes from @kairo/types —
// see the import above.

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
    p_status_filter: RESOLVED_STATUSES.join(","),
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

  // Fallback: full-text — same sender OR shared subject words, final-state tickets only
  const keywords = (ticket.subject ?? "")
    .split(/\s+/)
    .filter((w: string) => w.length > 3)
    .slice(0, 5);

  let fallbackQuery = supabase
    .from("tickets")
    .select("id, subject, resolved_at, resolution_summary, ticket_number")
    .eq("account_id", ctx.accountId)
    .in("status", [...RESOLVED_STATUSES])
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
    .select("id, subject, body_plain, from_email, ticket_type, priority, category, sentiment")
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

  // KAI-191: ai_classified/human_classified moved from the old events
  // table to ticket_classification_history — one row per dimension actually changed.
  const classifyModelVersion = resolveModelVersion();
  const classifyDimensionChanges: [ClassificationDimension, string | null, string | null][] = [
    ["ticket_type", ticket.ticket_type ?? null, classification.type],
    ["priority", ticket.priority ?? null, classification.priority],
    ["category", ticket.category ?? null, classification.category],
    ["sentiment", ticket.sentiment ?? null, classification.tone],
  ];
  for (const [dimension, fromValue, toValue] of classifyDimensionChanges) {
    if (fromValue === toValue) continue;
    await emitTicketClassification({
      accountId: ctx.accountId,
      ticketId: id,
      actorType: source === "human" ? "human" : "ai",
      actorUserId: source === "human" ? user.id : null,
      actorRef: "tickets.classify",
      dimension,
      fromValue,
      toValue,
      confidence: classification.confidence,
      modelVersion: classifyModelVersion,
      occurredAt: classified_at,
    });
  }

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
// Returns ticket_lifecycle_timeline newest first, paginated by cursor.
// (KAI-191: the old catch-all events table this used to read from has been
// dropped; ticket_lifecycle_timeline unions its five purpose-shaped
// successors — ticket_state_history, ticket_activity_log, ticket_notes,
// ticket_classification_history, messages — into the same one ordered
// stream per ticket.)
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
    .from("ticket_lifecycle_timeline")
    .select("*")
    .eq("ticket_id", id)
    .eq("account_id", ctx.accountId)
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    try {
      const { occurred_at } = JSON.parse(atob(cursor)) as { occurred_at: string };
      query = query.lt("occurred_at", occurred_at);
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
      ? btoa(JSON.stringify({ occurred_at: last.occurred_at }))
      : null;

  return c.json({ events: items, next_cursor: nextCursor, count: items.length });
});

// ---------------------------------------------------------------------------
// PATCH /v1/tickets/:id/status — typed state machine transition (KAI-50)
// ---------------------------------------------------------------------------

const UpdateStatusSchema = z.object({
  status: z.enum(TICKET_STATUSES as [TicketStatus, ...TicketStatus[]]),
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

  // KAI-191: legality (422) and permission (403) are different questions —
  // a legal transition can still be off-limits for this caller's role (e.g.
  // resolved -> closed, which no role reaches through the API).
  const role = await resolveMemberRole(ctx.userId, ctx.accountId);
  const permission = checkTransitionPermission(fromStatus, toStatus, role);
  if (!permission.ok) {
    return c.json(permission.body, permission.httpStatus);
  }

  // KAI-191: transitionTicketStatus() is the only place allowed to write
  // tickets.status — it atomically updates the row and records the
  // ticket_state_history trail. The isValidTransition() check above is kept
  // for a fast, precise 422 message; the RPC is the authoritative,
  // race-safe validator (ticket_transition_rules is generated from the same
  // ALLOWED_TRANSITIONS table, so the two can never disagree).
  const transition = await transitionTicketStatus(supabase, {
    ticketId: id,
    toState: toStatus,
    actorType: "human",
    actorUserId: user.id,
    trigger: "manual_status_change",
  });

  if (transition.outcome === "not_found") {
    return c.json({ error: "Ticket not found" }, 404);
  }
  if (transition.outcome === "invalid_transition" || transition.outcome === "no_op") {
    return c.json(
      { error: getTransitionError(fromStatus, toStatus), code: "INVALID_TRANSITION" },
      422
    );
  }

  const { data: updatedTicket, error: fetchErr2 } = await supabase
    .from("tickets")
    .select()
    .eq("id", id)
    .single();

  if (fetchErr2) return c.json({ error: fetchErr2.message }, 500);

  // KAI-191: the transition itself was already recorded in
  // ticket_state_history by transitionTicketStatus() above — no second copy
  // anywhere else.

  return c.json({ success: true, ticket: updatedTicket });
});

// ---------------------------------------------------------------------------
// GET /v1/tickets/:id/lifecycle — full state-machine history for one ticket
// (KAI-191)
//
// Everything here is read, never assembled: the timeline is
// ticket_state_history rows in seq order, durations_by_state is the
// ticket_state_durations view, and allowed_transitions comes straight out of
// getAllowedTransitionsForRole() so the UI never has to guess which actions
// to offer this caller.
// ---------------------------------------------------------------------------

interface TicketStateDurationRow {
  state: string;
  entered_at: string;
  exited_at: string | null;
  duration: string | null;
}

tickets.get("/:id/lifecycle", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");

  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, status")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .single();

  if (ticketErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  const currentState: TicketStatus = isTicketStatus(ticket.status ?? "")
    ? (ticket.status as TicketStatus)
    : "open";

  const [{ data: timelineRows, error: timelineErr }, { data: durationRows, error: durationErr }, role] =
    await Promise.all([
      supabase
        .from("ticket_state_history")
        .select("from_state, to_state, actor_type, actor_ref, trigger, reason, occurred_at")
        .eq("ticket_id", id)
        .eq("account_id", ctx.accountId)
        .order("seq", { ascending: true }),
      supabase
        .from("ticket_state_durations")
        .select("state, entered_at, exited_at, duration")
        .eq("ticket_id", id)
        .eq("account_id", ctx.accountId)
        .order("seq", { ascending: true }),
      resolveMemberRole(ctx.userId, ctx.accountId),
    ]);

  if (timelineErr) return c.json({ error: timelineErr.message }, 500);
  if (durationErr) return c.json({ error: durationErr.message }, 500);

  const durationsByState = (durationRows ?? []) as TicketStateDurationRow[];
  // The current state is whichever row hasn't exited yet — the view leaves
  // exited_at NULL for it (LEAD() finds no next row on the window).
  const currentStateRow = durationsByState.find((row) => row.exited_at === null) ?? durationsByState.at(-1);
  const currentStateSince = currentStateRow?.entered_at ?? null;
  const currentStateDuration = currentStateSince
    ? humanizeDuration(currentStateSince, new Date().toISOString())
    : null;

  const allowedTransitions = role ? getAllowedTransitionsForRole(currentState, role) : [];

  return c.json({
    ticket_id: id,
    current_state: currentState,
    current_state_since: currentStateSince,
    current_state_duration: currentStateDuration,
    timeline: timelineRows ?? [],
    durations_by_state: durationsByState,
    allowed_transitions: allowedTransitions,
  });
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

  await emitTicketActivity({
    accountId: ctx.accountId,
    ticketId: id,
    domain: "tickets",
    eventType: "assignment",
    actorType: "human",
    actorUserId: user.id,
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
    // KAI-191: escalating is this endpoint's whole purpose, so a role that
    // can't drive this edge fails the request outright — same 403 contract
    // as PATCH /status. (Legality was just checked above, so this only ever
    // resolves to the ok or 403 branch — never 422 — but routing it through
    // the same single gate keeps the two endpoints' behaviour identical.)
    const role = await resolveMemberRole(ctx.userId, ctx.accountId);
    const permission = checkTransitionPermission(fromStatus, toEscalated, role);
    if (!permission.ok) {
      return c.json(permission.body, permission.httpStatus);
    }

    // KAI-191: transitionTicketStatus() is the only place allowed to write
    // tickets.status — see the PATCH /status handler above for why the
    // isValidTransition() pre-check is still kept alongside it.
    const transition = await transitionTicketStatus(supabase, {
      ticketId: id,
      toState: toEscalated,
      actorType: "human",
      actorUserId: user.id,
      trigger: "escalate_action",
    });
    if (transition.outcome === "applied") {
      const { data } = await supabase.from("tickets").select().eq("id", id).single();
      updatedTicket = data as Record<string, unknown> | null;
      // KAI-191: the transition itself was already recorded in
      // ticket_state_history by transitionTicketStatus() above — no second
      // copy anywhere else.
    }
  }

  // Emit escalated activity with reason
  await emitTicketActivity({
    accountId: ctx.accountId,
    ticketId: id,
    domain: "escalation",
    eventType: "escalated",
    actorType: "human",
    actorUserId: user.id,
    reason: parsed.data.reason ?? null,
  });

  return c.json({ ticket_id: id, escalated: true, ticket: updatedTicket });
});

// ---------------------------------------------------------------------------
// POST /v1/tickets/:id/notes — add an internal note (KAI-221)
// Internal notes are visible only to agents. Stored as ticket_notes (KAI-191:
// notes are content an author can still edit or retract, not an append-only
// event). Also returned as a synthetic ThreadMessage so the UI can append it
// optimistically.
// ---------------------------------------------------------------------------

// KAI-232: 2000 chars, matching the design spec (rule F.9). The composer shows
// a counter from 1800 on. Was 50000 when KAI-221 shipped the endpoint.
export const INTERNAL_NOTE_MAX_LENGTH = 2000;

const InternalNoteSchema = z.object({
  body: z.string().min(1).max(INTERNAL_NOTE_MAX_LENGTH),
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

  // Fetch agent display name for the synthetic message.
  // KAI-232: was querying the non-existent `user_profiles` table, so author
  // names were always null. The real table is `profiles` (column `name`).
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email")
    .eq("id", user.id)
    .maybeSingle();

  const agentName = (profile as { name?: string; email?: string } | null)?.name ?? null;
  const agentEmail = (profile as { name?: string; email?: string } | null)?.email ?? null;

  const now = new Date().toISOString();

  // Insert note into ticket_notes (KAI-191)
  const { data: noteRow, error: insertErr } = await supabase
    .from("ticket_notes")
    .insert({
      account_id: ctx.accountId,
      ticket_id: id,
      author_id: user.id,
      body: parsed.data.body,
    })
    .select("id, created_at")
    .single();

  if (insertErr || !noteRow) {
    return c.json({ error: insertErr?.message ?? "Failed to insert note" }, 500);
  }

  const createdNote = noteRow as { id: string; created_at: string };

  // KAI-232: mention fan-out. Non-fatal by contract — a failed notification
  // must never fail the note the agent just wrote.
  const mentions = await fanOutNoteMentions({
    accountId: ctx.accountId,
    ticketId: id,
    ticketNoteId: createdNote.id,
    authorId: user.id,
    body: parsed.data.body,
  });

  // Return a ThreadMessage-shaped object (direction="internal") so the UI
  // can append it to the thread without a full reload.
  const note = {
    id: createdNote.id,
    direction: "internal" as const,
    sender_external_id: agentEmail,
    sender_display_name: agentName,
    body_plain: parsed.data.body,
    body_html: null,
    snippet: parsed.data.body.substring(0, 120),
    received_at: createdNote.created_at ?? now,
    is_origin: false,
    delivery_status: null,
    send_error: null,
    mentions: markOwnMentions(mentions, user.id),
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

// KAI-191 — statuses that auto-transition to `awaiting_customer` when an
// agent sends a reply. Replying means "now waiting on the customer" —
// applies to any active state (incl. reopened, KAI-221), not just
// open/in_progress. Resolved/escalated/awaiting are intentionally
// excluded. Exhaustive over TicketStatus so a new status forces an explicit
// decision here instead of silently being left out (or wrongly included).
const IS_AUTO_AWAITING_SOURCE: Record<TicketStatus, boolean> = {
  open: true,
  in_progress: true,
  reopened: true,
  awaiting_customer: false,
  resolved: false,
  ai_resolved: false,
  escalated: false,
  closed: false,
};

const AUTO_AWAITING_SOURCES: TicketStatus[] = TICKET_STATUSES.filter(
  (status) => IS_AUTO_AWAITING_SOURCE[status]
);

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
  // KAI-191: same reasoning extends to permission — a resolve the caller's
  // role isn't allowed to drive must also fail before anything is queued.
  const intent = parsed.data.intent;
  if (intent === "resolve") {
    const fromStatus: TicketStatus = isTicketStatus(ticket.status ?? "") ? (ticket.status as TicketStatus) : "open";
    const role = await resolveMemberRole(ctx.userId, ctx.accountId);
    const permission = checkTransitionPermission(fromStatus, "resolved", role);
    if (!permission.ok) {
      return c.json(permission.body, permission.httpStatus);
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
  const shouldTransitionToAwaiting =
    intent === "reply" && isTicketStatus(currentStatus) && AUTO_AWAITING_SOURCES.includes(currentStatus as TicketStatus);

  // KAI-247: "Enviar y resolver" transitions to `resolved` atomically with the enqueue.
  const finalStatus: string = intent === "resolve" ? "resolved" : shouldTransitionToAwaiting ? "awaiting_customer" : currentStatus;

  // last_response_at / first_response_at are unrelated to tickets.status, so
  // they stay a direct update. KAI-191: transitionTicketStatus() is the only
  // place allowed to write tickets.status — see below.
  await supabase
    .from("tickets")
    .update({
      last_response_at: nowIso,
      // KAI-168 — first agent response freezes the operational SLA clock.
      ...(ticket.first_response_at ? {} : { first_response_at: nowIso }),
    })
    .eq("id", id);

  if (finalStatus !== currentStatus) {
    // The resolve path was already validated above (before anything was
    // queued); the reply/awaiting path is derived from AUTO_AWAITING_SOURCES,
    // which is exactly the set of states ALLOWED_TRANSITIONS can reach
    // 'awaiting_customer' from. Neither should ever disagree with
    // ticket_transition_rules — if one does, that's a real bug to see in
    // logs, not something to paper over here.
    //
    // KAI-191: resolve's role check already ran above, before the reply was
    // queued. The awaiting_customer path is derived, not user-selected — by
    // this point the reply is already queued, so a role that can't drive
    // this edge just means the ticket doesn't move, not that the request
    // fails. Same "log, don't paper over" treatment as invalid_transition.
    const role = await resolveMemberRole(ctx.userId, ctx.accountId);
    if (!role || !isTransitionAllowedForRole(currentStatus as TicketStatus, finalStatus as TicketStatus, role)) {
      console.error(
        `[reply] role '${role ?? "none"}' not permitted to transition ticket ${id} from ${currentStatus} to ${finalStatus}; reply queued, status left unchanged`
      );
    } else {
      const transition = await transitionTicketStatus(supabase, {
        ticketId: id,
        toState: finalStatus as TicketStatus,
        actorType: "human",
        actorUserId: user.id,
        trigger: intent === "resolve" ? "agent_reply_resolve" : "agent_reply",
      });
      if (transition.outcome === "invalid_transition" || transition.outcome === "not_found") {
        console.error(
          `[reply] unexpected transition outcome for ticket ${id} (${currentStatus} -> ${finalStatus}): ${transition.outcome}`
        );
      }
    }
  }

  // KAI-191: reply_sent used to be emitted here as a pointer event carrying
  // metadata.message_id, but the reply already exists as its own row in
  // `messages` (inserted above, with its own timestamp) — dropped outright,
  // nothing replaces it.

  // KAI-191: any status change here was already recorded in
  // ticket_state_history by transitionTicketStatus() — no second copy
  // anywhere else.

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

  // Fetch internal notes from ticket_notes and merge into thread (KAI-221,
  // repointed off the old events table by KAI-191)
  const { data: noteEvents } = await supabase
    .from("ticket_notes")
    .select("id, author_id, body, created_at")
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  if (noteEvents && noteEvents.length > 0) {
    // Resolve author names in one query
    const authorIds = [...new Set((noteEvents as { author_id: string | null }[]).map((e) => e.author_id).filter(Boolean))] as string[];
    // KAI-232: `user_profiles` does not exist — the real table is `profiles`
    // with a `name` column, so author names used to resolve to null here.
    const { data: profiles } = authorIds.length
      ? await supabase.from("profiles").select("id, name, email").in("id", authorIds)
      : { data: [] };
    const profileMap = Object.fromEntries(
      ((profiles ?? []) as { id: string; name?: string; email?: string }[]).map((p) => [p.id, p])
    );

    // KAI-232: resolve every mention token in one batch so the client can
    // render chips without ever persisting display names (ADR-025 §3).
    const typedNotes = noteEvents as {
      id: string;
      author_id: string | null;
      body: string | null;
      created_at: string;
    }[];
    const mentionedIds = [
      ...new Set(typedNotes.flatMap((evt) => extractMentionUserIds(evt.body ?? ""))),
    ];
    const mentionNames = await resolveMentionNames(mentionedIds);

    // KAI-232: which of these notes hold an UNREAD mention of the caller.
    // Drives the note card's unread treatment (design spec B4) — per-viewer
    // state, so it can only be resolved here, not derived from the body.
    const { data: unreadRows } = await supabase
      .from("ticket_note_mentions")
      .select("ticket_note_id")
      .eq("account_id", ctx.accountId)
      .eq("mentioned_user_id", ctx.userId)
      .is("read_at", null)
      .in("ticket_note_id", typedNotes.map((e) => e.id));

    const unreadEventIds = new Set(
      ((unreadRows ?? []) as { ticket_note_id: string }[]).map((r) => r.ticket_note_id),
    );

    for (const evt of typedNotes) {
      const profile = evt.author_id ? profileMap[evt.author_id] : null;
      messages.push({
        id: evt.id,
        direction: "internal",
        sender_external_id: profile?.email ?? null,
        sender_display_name: profile?.name ?? null,
        body_plain: evt.body,
        body_html: null,
        snippet: evt.body?.substring(0, 120) ?? null,
        received_at: evt.created_at,
        is_origin: false,
        delivery_status: null,
        send_error: null,
        mentions: extractMentionUserIds(evt.body ?? "").map((user_id) => ({
          user_id,
          name: mentionNames.get(user_id) ?? null,
          // Lets the client render a solid chip for "you were tagged" without
          // knowing who the viewer is (KAI-232).
          is_me: user_id === ctx.userId,
        })),
        // Author identity for the note card's avatar (design spec B4).
        author_id: evt.author_id,
        is_own_note: evt.author_id === ctx.userId,
        mentions_me: extractMentionUserIds(evt.body ?? "").includes(ctx.userId),
        mention_unread: unreadEventIds.has(evt.id),
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

  const { data: updatedProposal, error: proposalErr } = await supabase
    .from("ticket_proposals")
    .update({
      status: parsed.data.action === "confirm" ? "confirmed" : "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
    })
    .eq("id", parsed.data.proposal_id)
    .eq("ticket_id", id)
    .select("proposed_category, proposed_priority, proposed_type, proposed_sentiment, proposed_emotion, confidence_score, model_version")
    .single();

  if (proposalErr) return c.json({ error: proposalErr.message }, 500);

  // KAI-191: ai_confirmed/ai_rejected moved from the old events table to
  // ticket_classification_history — one row per dimension the AI proposed
  // that this human review decision touched. Confirm/reject reviews a
  // decision already applied to the ticket at proposal time; the review
  // itself carries no new from/to value, so from_value stays unset here.
  const reviewOutcome = parsed.data.action === "confirm" ? "confirmed" : "rejected";
  const proposedDimensions: [ClassificationDimension, string | null][] = [
    ["category", updatedProposal?.proposed_category ?? null],
    ["priority", updatedProposal?.proposed_priority ?? null],
    ["ticket_type", updatedProposal?.proposed_type ?? null],
    ["sentiment", updatedProposal?.proposed_sentiment ?? null],
    ["emotion", updatedProposal?.proposed_emotion ?? null],
  ];
  for (const [dimension, proposedValue] of proposedDimensions) {
    if (proposedValue === null) continue;
    await emitTicketClassification({
      accountId: ctx.accountId,
      ticketId: id,
      actorType: "human",
      actorUserId: user.id,
      actorRef: "tickets.classify-approve",
      dimension,
      toValue: proposedValue,
      confidence: updatedProposal?.confidence_score ?? null,
      modelVersion: updatedProposal?.model_version ?? null,
      metadata: { proposal_id: parsed.data.proposal_id, review_outcome: reviewOutcome },
    });
  }

  return c.json({ ticket_id: id, proposal_id: parsed.data.proposal_id, action: parsed.data.action });
});

// ---------------------------------------------------------------------------
// POST /v1/tickets/:id/suggest-reply — context-aware reply suggestion (KAI-31)
// Assembles 5 context sources, calls Claude, stores in ticket_proposals.
// All context sources degrade gracefully — partial context is better than no call.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
// 5 levels up from apps/api/src/routes/v1 reaches the repo root.
const PROMPT_DIR = join(__dirname, "../../../../../packages/intelligence/prompts/reply-suggestion");

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

  // KAI-191: classification_corrected moved from the old events table to
  // ticket_classification_history — one row per dimension actually changed
  // by this human correction. ticketPatch keys already match dimension names
  // (ticket_type/priority/category/sentiment) 1:1.
  const correctionBeforeValues: Record<string, string | null> = {
    ticket_type: ticket.ticket_type ?? null,
    priority: ticket.priority ?? null,
    category: ticket.category ?? null,
    sentiment: ticket.sentiment ?? null,
  };
  for (const [dimension, toValue] of Object.entries(ticketPatch) as [ClassificationDimension, string][]) {
    const fromValue = correctionBeforeValues[dimension] ?? null;
    if (fromValue === toValue) continue;
    await emitTicketClassification({
      accountId: ctx.accountId,
      ticketId,
      actorType: "human",
      actorUserId: user.id,
      actorRef: "tickets.correct-classification",
      dimension,
      fromValue,
      toValue,
      metadata: { feedback_id: feedback.id },
    });
  }

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
