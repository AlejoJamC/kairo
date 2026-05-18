import { classifyEmail } from "@kairo/intelligence";
import { inngest } from "../lib/inngest.js";
import { supabase } from "../lib/supabase.js";
import type { BatchTicketResult } from "../lib/schemas/classification.js";

export const batchClassify = inngest.createFunction(
  { id: "batch-classify", triggers: [{ event: "tickets/batch-classify.triggered" }] },
  async ({ event, step }) => {
    const { userId, ticketIds, forceReclassify, jobId } = event.data;

    // -----------------------------------------------------------------------
    // Step 1: Fetch tickets scoped to account (ADR-022: account_id, not user_id)
    // -----------------------------------------------------------------------
    const tickets = (await step.run("fetch-tickets", async () => {
      const { data: memberRow } = await supabase
        .from("account_members")
        .select("account_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const accountId = memberRow?.account_id;
      if (!accountId) return [];

      const { data } = await supabase
        .from("tickets")
        .select("id, subject, body_plain, from_email, classified_at")
        .in("id", ticketIds)
        .eq("account_id", accountId);
      return data ?? [];
    })) as Array<{
      id: string;
      subject: string;
      body_plain: string | null;
      from_email: string;
      classified_at: string | null;
    }>;

    const foundIds = new Set(tickets.map((t) => t.id));

    // -----------------------------------------------------------------------
    // Step 2: Check for human corrections on force-reclassify tickets
    // -----------------------------------------------------------------------
    const protectedIds = (await step.run("check-human-corrections", async () => {
      if (!forceReclassify) return [] as string[];
      const candidates = ticketIds.filter((id) => foundIds.has(id));
      if (candidates.length === 0) return [] as string[];
      const { data } = await supabase
        .from("classification_feedback")
        .select("ticket_id")
        .in("ticket_id", candidates);
      return (data ?? []).map((r) => r.ticket_id) as string[];
    })) as string[];

    const protectedSet = new Set(protectedIds);

    // -----------------------------------------------------------------------
    // Step 3: Classify eligible tickets
    // -----------------------------------------------------------------------
    const results = (await step.run("classify-eligible", async () => {
      const out: BatchTicketResult[] = [];

      // Not-found tickets
      for (const id of ticketIds) {
        if (!foundIds.has(id)) {
          out.push({ ticket_id: id, status: "failed", reason: "not_found" });
        }
      }

      for (const ticket of tickets) {
        // Protected by human correction
        if (protectedSet.has(ticket.id)) {
          out.push({
            ticket_id: ticket.id,
            status: "protected",
            reason: "human_correction_exists",
          });
          continue;
        }

        // Already classified and not forcing
        if (!forceReclassify && ticket.classified_at !== null) {
          out.push({
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

          out.push({ ticket_id: ticket.id, status: "success", classification });
        } catch (err) {
          out.push({
            ticket_id: ticket.id,
            status: "failed",
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return out;
    })) as BatchTicketResult[];

    // -----------------------------------------------------------------------
    // Step 4: Persist job result to Supabase
    // -----------------------------------------------------------------------
    await step.run("persist-job-result", async () => {
      const processed = results.filter((r) => r.status === "success").length;
      const skipped = results.filter((r) => r.status === "skipped").length;
      const protectedCount = results.filter((r) => r.status === "protected").length;
      const failed = results.filter((r) => r.status === "failed").length;

      await supabase
        .from("batch_classify_jobs")
        .update({
          status: "completed",
          processed,
          skipped,
          protected: protectedCount,
          failed,
          results,
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    });
  }
);
