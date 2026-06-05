import { Hono } from "hono";
import { z } from "zod";
import { classifyEmail, generateEmbedding } from "@kairo/intelligence";
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
import { emitTicketEvent } from "../../lib/ticket-events.js";
import { sendGmailReply, GmailSendException } from "../../lib/gmail-send.js";
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
import { linkMessageToTicket } from "../../lib/ticket-messages.js";

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
  const user = { id: ctx.userId };

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

  return c.json({ data: items, next_cursor: nextCursor, count: items.length });
});

// ---------------------------------------------------------------------------
// POST /v1/tickets/:id/recalculate-score
// ---------------------------------------------------------------------------

tickets.post("/:id/recalculate-score", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);
  const user = { id: ctx.userId };

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
  const user = { id: ctx.userId };

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
      id: r.id,
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
    .filter((w) => w.length > 3)
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

tickets.get("/:id/similar", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);
  const user = { id: ctx.userId };

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

  // Call pgvector RPC — degrade gracefully if extension/function not yet deployed
  const { data, error } = await supabase.rpc("find_similar_tickets", {
    p_ticket_id: id,
    p_account_id: ctx.accountId,
    p_limit: limit,
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
  try {
    classification = await classifyEmail({
      subject: ticket.subject,
      body: ticket.body_plain ?? "",
      from: ticket.from_email,
    });
  } catch (err) {
    return c.json(
      {
        error: "Classification failed",
        detail: err instanceof Error ? err.message : String(err),
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
    try {
      const classification = await classifyEmail({
        subject: ticket.subject,
        body: ticket.body_plain ?? "",
        from: ticket.from_email,
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
      results.push({
        ticket_id: ticket.id,
        status: "failed",
        reason: err instanceof Error ? err.message : String(err),
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
  const user = { id: ctx.userId };

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
    .select("id")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .single();

  if (fetchErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  await emitTicketEvent({
    ticketId: id,
    authorId: user.id,
    eventType: "escalated",
    body: parsed.data.reason ?? null,
    isInternal: true,
  });

  return c.json({ ticket_id: id, escalated: true });
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

  // 1. Fetch ticket + linked conversation
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, subject, from_email, gmail_thread_id, conversation_id, status, account_id")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .single();

  if (ticketErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

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

  // 3. Resolve Gmail OAuth token from oauth_credentials (ADR-022 canonical).
  let gmailAccessToken: string | null = null;
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
      gmailAccessToken = cred.access_token_enc;
      gmailFromEmail   = cred.external_account_id;
    }
  }

  if (!gmailAccessToken) {
    return c.json({ error: "No Gmail integration found", code: "NO_GMAIL_INTEGRATION" }, 422);
  }

  // 4. Send via Gmail API
  let sendResult: { messageId: string; threadId: string };
  try {
    sendResult = await sendGmailReply({
      accessToken: gmailAccessToken,
      threadId,
      to: ticket.from_email ?? "",
      subject: ticket.subject?.startsWith("Re:") ? ticket.subject : `Re: ${ticket.subject}`,
      bodyPlain: parsed.data.body,
    });
  } catch (err) {
    if (err instanceof GmailSendException) {
      const status = err.gmailError.code === "GMAIL_TOKEN_EXPIRED" ? 401 : 502;
      return c.json({ error: err.gmailError.code, ...err.gmailError }, status);
    }
    return c.json({ error: "GMAIL_API_ERROR", detail: String(err) }, 502);
  }

  // 5. Record outbound message + link to ticket (KAI-165)
  if (channelIntegrationId) {
    const { data: outboundMsg } = await supabase.from("messages").insert({
      account_id: ticket.account_id,
      conversation_id: ticket.conversation_id,
      channel_integration_id: channelIntegrationId,
      external_id: sendResult.messageId,
      thread_external_id: sendResult.threadId,
      direction: "outbound",
      sender_external_id: gmailFromEmail,
      sender_display_name: gmailFromEmail,
      body_plain: parsed.data.body,
      body_html: parsed.data.bodyMarkdown ?? null,
      snippet: parsed.data.body.slice(0, 200),
      raw_payload: { gmail_message_id: sendResult.messageId, thread_id: sendResult.threadId },
      received_at: new Date().toISOString(),
    }).select("id").single();

    if (outboundMsg?.id) {
      await linkMessageToTicket(supabase, {
        ticket_id: ticket.id,
        message_id: outboundMsg.id,
        is_origin: false,
      });
    }
  }

  // 6. Update ticket: last_response_at + auto-transition to awaiting_customer (KAI-50)
  const currentStatus = ticket.status ?? "open";
  const AUTO_AWAITING_SOURCES: TicketStatus[] = ["open", "in_progress"];
  const shouldTransition = isTicketStatus(currentStatus) && AUTO_AWAITING_SOURCES.includes(currentStatus as TicketStatus);

  await supabase
    .from("tickets")
    .update({
      last_response_at: new Date().toISOString(),
      ...(shouldTransition ? { status: "awaiting_customer" } : {}),
    })
    .eq("id", id);

  // 7. Emit activity event
  await emitTicketEvent({
    ticketId: id,
    authorId: user.id,
    eventType: "reply_sent",
    body: parsed.data.body,
    metadata: { gmail_message_id: sendResult.messageId, thread_id: sendResult.threadId },
  });

  if (shouldTransition) {
    await emitTicketEvent({
      ticketId: id,
      authorId: user.id,
      eventType: "status_change",
      metadata: { from: currentStatus, to: "awaiting_customer", trigger: "reply_sent" },
    });
  }

  return c.json({ success: true, messageId: sendResult.messageId });
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
        body_plain, body_html, snippet, received_at
      )
    `)
    .eq("ticket_id", id)
    .order("created_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 500);

  const messages = (data ?? [])
    .map((row) => ({
      ...(row.messages as Record<string, unknown>),
      is_origin: row.is_origin,
    }))
    .filter((m) => m.id); // skip orphans

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
  const user = { id: ctx.userId };

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
  const { data: similar } = await supabase.rpc("find_similar_tickets", {
    p_ticket_id: id,
    p_account_id: ctx.accountId,
    p_limit: 1,
    p_status_filter: "resolved",
  }).catch(() => ({ data: null }));

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
  let suggestion: string;
  let confidence: number;

  try {
    const raw = await provider.complete(prompt, { maxTokens: 1500, temperature: 0.4 });
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = SuggestReplyResponseSchema.parse(JSON.parse(jsonMatch[0]));
    suggestion = parsed.suggestion;
    confidence = parsed.confidence;
  } catch (err) {
    return c.json(
      { error: "Suggestion failed", detail: err instanceof Error ? err.message : String(err) },
      500
    );
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
  });
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

  const [clientRes, totalRes, last30Res, last90Res, recentRes] = await Promise.all([
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
  const user = { id: ctx.userId };

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
  const user = { id: ctx.userId };

  const id = c.req.param("id");

  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, subject, body_plain")
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .single();

  if (ticketErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  // Helper: fetch published articles and optionally enrich with similarity
  async function fetchPublishedArticles(ids?: string[], similarities?: Map<string, number>) {
    const q = supabase
      .from("kb_articles")
      .select("id, title, content, tags")
      .eq("account_id", ctx.accountId)
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
      p_account_id: ctx.accountId,
      p_limit: KB_LIMIT,
    }),
    supabase.rpc("find_similar_tickets", {
      p_ticket_id: id,
      p_account_id: ctx.accountId,
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
