import { Hono } from "hono";
import { classifyEmail } from "@kairo/intelligence";
import { supabase } from "../../lib/supabase.js";
import { inngest } from "../../lib/inngest.js";
import { env } from "../../env.js";
import {
  ClassifyBatchRequestSchema,
  type BatchTicketResult,
} from "../../lib/schemas/classification.js";

export const tickets = new Hono();

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
      ticket_type: classification.tipo,
      priority: classification.prioridad,
      category: classification.categoria,
      sentiment: classification.sentimiento,
      ai_reasoning: classification.razonamiento,
      classification_confidence: classification.confianza,
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
          ticket_type: classification.tipo,
          priority: classification.prioridad,
          category: classification.categoria,
          sentiment: classification.sentimiento,
          ai_reasoning: classification.razonamiento,
          classification_confidence: classification.confianza,
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
