import { Hono } from "hono";
import { classifyEmail } from "@kairo/intelligence";
import { supabase } from "../../lib/supabase.js";

export const tickets = new Hono();

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
