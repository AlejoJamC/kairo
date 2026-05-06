import { Hono } from "hono";
import { z } from "zod";
import { classifyEmail } from "@kairo/intelligence";
import { supabase } from "../../lib/supabase.js";
import { inngest } from "../../lib/inngest.js";
import { env } from "../../env.js";
import {
  ClassifyBatchRequestSchema,
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

export const tickets = new Hono();

// ---------------------------------------------------------------------------
// Auth helper (shared across endpoints)
// ---------------------------------------------------------------------------

async function resolveUser(authHeader: string) {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// ---------------------------------------------------------------------------
// GET /v1/tickets — paginated list sorted by priority_score DESC NULLS LAST
// ---------------------------------------------------------------------------

tickets.get("/", async (c) => {
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const limit = Math.min(Number(c.req.query("limit") ?? 20), 100);
  const cursor = c.req.query("cursor");

  let query = supabase
    .from("tickets")
    .select("*")
    .eq("user_id", user.id)
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
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");

  // 1. Fetch ticket
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, ticket_type, sentiment, received_at, created_at, from_email, client_id, emotion, user_id")
    .eq("id", id)
    .eq("user_id", user.id)
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
    .eq("user_id", user.id)
    .eq("from_email", ticket.from_email ?? "")
    .gte("created_at", thirtyDaysAgo);

  // 4. Fetch tenant weights (fallback to defaults)
  const { data: configRow } = await supabase
    .from("tenant_priority_config")
    .select("weight_type, weight_plan, weight_emotion, weight_age")
    .eq("user_id", user.id)
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
    .eq("user_id", user.id)
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
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");

  // Verify ticket belongs to user
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, from_email, subject")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (ticketErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  // Primary: pgvector RPC
  const { data: rpcData, error: rpcError } = await supabase.rpc("find_similar_tickets", {
    p_ticket_id: id,
    p_user_id: user.id,
    p_limit: 3,
    p_status_filter: "resolved",
  });

  if (!rpcError) {
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
    .eq("user_id", user.id)
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
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit") ?? 5), 20);

  // Verify ticket belongs to user
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (ticketErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  // Call pgvector RPC — degrade gracefully if extension/function not yet deployed
  const { data, error } = await supabase.rpc("find_similar_tickets", {
    p_ticket_id: id,
    p_user_id: user.id,
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
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

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

  // Resolve user_id from Authorization header (Bearer token → Supabase JWT sub)
  const authHeader = c.req.header("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const userId = user.id;

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
    .eq("user_id", userId);

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
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
  const cursor = c.req.query("cursor");

  // Verify ticket belongs to user (tenant isolation)
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
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
// PATCH /v1/tickets/:id/status — update ticket status (KAI-28)
// ---------------------------------------------------------------------------

const UpdateStatusSchema = z.object({
  status: z.enum(["open", "in_progress", "waiting", "resolved", "closed"]),
});

tickets.patch("/:id/status", async (c) => {
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = UpdateStatusSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);

  const { data: ticket, error: fetchErr } = await supabase
    .from("tickets")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !ticket) return c.json({ error: "Ticket not found" }, 404);

  const { error: updateErr } = await supabase
    .from("tickets")
    .update({ status: parsed.data.status })
    .eq("id", id);

  if (updateErr) return c.json({ error: updateErr.message }, 500);

  await emitTicketEvent({
    ticketId: id,
    authorId: user.id,
    eventType: "status_change",
    metadata: { from_status: ticket.status, to_status: parsed.data.status },
  });

  return c.json({ ticket_id: id, status: parsed.data.status });
});

// ---------------------------------------------------------------------------
// POST /v1/tickets/:id/escalate — escalate ticket (KAI-28)
// ---------------------------------------------------------------------------

const EscalateSchema = z.object({
  reason: z.string().min(1).max(1000).optional(),
});

tickets.post("/:id/escalate", async (c) => {
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");

  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }

  const parsed = EscalateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);

  const { data: ticket, error: fetchErr } = await supabase
    .from("tickets")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
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
// Token source: gmail_accounts (Gmail-specific — see gmail-send.ts for the
// deferred multi-account / omnichannel token abstraction note).
// ---------------------------------------------------------------------------

const ReplySchema = z.object({
  body: z.string().min(1),
  bodyMarkdown: z.string().optional(),
  templateId: z.string().uuid().optional(),
});

tickets.post("/:id/reply", async (c) => {
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");

  let reqBody: unknown;
  try { reqBody = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = ReplySchema.safeParse(reqBody);
  if (!parsed.success) return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);

  // 1. Fetch ticket + linked conversation
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, subject, from_email, gmail_thread_id, conversation_id")
    .eq("id", id)
    .eq("user_id", user.id)
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

  // 3. Resolve Gmail OAuth token from gmail_accounts
  const { data: gmailAccount } = await supabase
    .from("gmail_accounts")
    .select("access_token, email")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!gmailAccount?.access_token) {
    return c.json({ error: "No Gmail integration found", code: "NO_GMAIL_INTEGRATION" }, 422);
  }

  // 4. Send via Gmail API
  let sendResult: { messageId: string; threadId: string };
  try {
    sendResult = await sendGmailReply({
      accessToken: gmailAccount.access_token,
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

  // 5. Record outbound message
  if (channelIntegrationId) {
    await supabase.from("messages").insert({
      conversation_id: ticket.conversation_id,
      channel_integration_id: channelIntegrationId,
      external_id: sendResult.messageId,
      thread_external_id: sendResult.threadId,
      direction: "outbound",
      sender_external_id: gmailAccount.email,
      sender_display_name: gmailAccount.email,
      body_plain: parsed.data.body,
      body_html: parsed.data.bodyMarkdown ?? null,
      snippet: parsed.data.body.slice(0, 200),
      raw_payload: { gmail_message_id: sendResult.messageId, thread_id: sendResult.threadId },
      received_at: new Date().toISOString(),
    });
  }

  // 6. Update ticket last_response_at
  await supabase
    .from("tickets")
    .update({ last_response_at: new Date().toISOString() })
    .eq("id", id);

  // 7. Emit activity event
  await emitTicketEvent({
    ticketId: id,
    authorId: user.id,
    eventType: "reply_sent",
    body: parsed.data.body,
    metadata: { gmail_message_id: sendResult.messageId, thread_id: sendResult.threadId },
  });

  return c.json({ success: true, messageId: sendResult.messageId });
});

// ---------------------------------------------------------------------------
// POST /v1/tickets/:id/classify-approve — approve or reject AI proposal (KAI-28)
// ---------------------------------------------------------------------------

const ClassifyApproveSchema = z.object({
  proposal_id: z.string().uuid(),
  action: z.enum(["confirm", "reject"]),
});

tickets.post("/:id/classify-approve", async (c) => {
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = ClassifyApproveSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);

  const { data: ticket, error: fetchErr } = await supabase
    .from("tickets")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
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
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");

  // 1. Ticket — required; fail hard only here
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, subject, ticket_type, priority, category, emotion, conversation_id, client_id, from_email")
    .eq("id", id)
    .eq("user_id", user.id)
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
    p_user_id: user.id,
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
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const ticketId = c.req.param("id");

  // 1. Fetch ticket to verify ownership and get client_id
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, client_id, from_email")
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .single();

  if (ticketErr || !ticket) return c.json({ error: "Ticket not found" }, 404);
  if (!ticket.client_id)    return c.json({ error: "No client linked to this ticket" }, 404);

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
      .select("id, name, telephone, authorized_emails, plan_type, sla_level, internal_id")
      .eq("id", ticket.client_id)
      .eq("user_id", user.id)
      .single(),

    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("client_id", ticket.client_id),

    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("client_id", ticket.client_id)
      .gte("created_at", now30),

    supabase
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("client_id", ticket.client_id)
      .gte("created_at", now90),

    supabase
      .from("tickets")
      .select("id, ticket_number, subject, status, created_at")
      .eq("user_id", user.id)
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
    name:            client.name,
    email:           client.authorized_emails?.[0] ?? ticket.from_email ?? null,
    phone:           client.telephone ?? null,
    clientType:      normalizePlanTier(client.plan_type) as "enterprise" | "pro" | "starter" | "unknown",
    activePlan:      client.plan_type ?? null,
    planScore:       planScoreFromTier(client.plan_type),
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
  userId: string,
): Promise<EscalationContext | null> {
  const now7d  = new Date(Date.now() -  7 * 24 * 60 * 60 * 1000).toISOString();
  const now30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch ticket fields needed for rule evaluation
  const { data: ticket, error: ticketErr } = await supabase
    .from("tickets")
    .select("id, emotion, sla_breached, sla_due_at, created_at, status, client_id, from_email")
    .eq("id", ticketId)
    .eq("user_id", userId)
    .single();

  if (ticketErr || !ticket) return null;

  // Resolve planScore from client
  let planScore = 0;
  if (ticket.client_id) {
    const { data: client } = await supabase
      .from("clients")
      .select("plan_type")
      .eq("id", ticket.client_id)
      .eq("user_id", userId)
      .single();
    planScore = planScoreFromTier(client?.plan_type ?? null);
  }

  // Parallel counts: tickets last 30d + technical tickets last 7d (same client)
  const [last30Res, tech7Res, similarRes] = await Promise.all([
    ticket.client_id
      ? supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("client_id", ticket.client_id)
          .gte("created_at", now30d)
      : Promise.resolve({ count: 0 }),

    ticket.client_id
      ? supabase
          .from("tickets")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("client_id", ticket.client_id)
          .eq("category", "technical")
          .gte("created_at", now7d)
      : Promise.resolve({ count: 0 }),

    // past_l2_case: find similar tickets then cross with escalations table
    supabase.rpc("find_similar_tickets", {
      p_ticket_id: ticketId,
      p_user_id:   userId,
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
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const ticketId = c.req.param("id");

  const ctx = await buildEscalationContext(ticketId, user.id);
  if (!ctx) return c.json({ error: "Ticket not found" }, 404);

  const result = detectEscalationTriggers(ctx);

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
