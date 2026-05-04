import { Hono } from "hono";
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
// ---------------------------------------------------------------------------

tickets.post("/:id/classify", async (c) => {
  const id = c.req.param("id");

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
