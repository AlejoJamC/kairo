import { Hono } from "hono";
import { z } from "zod";
import { supabase } from "../../lib/supabase.js";
import { resolveUserAndAccount } from "../../lib/auth.js";

export const templates = new Hono();

// Detect locale from Accept-Language header — defaults to 'es'.
function resolveLocale(acceptLanguage: string | undefined): "es" | "en" {
  if (!acceptLanguage) return "es";
  return acceptLanguage.toLowerCase().startsWith("en") ? "en" : "es";
}

const DEFAULT_TEMPLATES: Record<"es" | "en", Array<{ title: string; content: string; category: string }>> = {
  es: [
    {
      title: "Recibimos tu consulta",
      content:
        "Hola, gracias por contactarnos. Hemos recibido tu consulta y la estamos revisando. Te responderemos a la brevedad posible.",
      category: "acknowledgment",
    },
    {
      title: "Necesitamos más información",
      content:
        "Hola, para poder ayudarte mejor necesitamos información adicional sobre tu caso. ¿Podrías proporcionarnos más detalles?",
      category: "follow_up",
    },
    {
      title: "Ticket resuelto",
      content:
        "Hola, nos complace informarte que tu consulta ha sido resuelta. Si tienes alguna pregunta adicional, no dudes en contactarnos.",
      category: "resolution",
    },
  ],
  en: [
    {
      title: "We received your inquiry",
      content:
        "Hello, thank you for reaching out. We have received your inquiry and are reviewing it. We will get back to you as soon as possible.",
      category: "acknowledgment",
    },
    {
      title: "We need more information",
      content:
        "Hello, to better assist you we need some additional information about your case. Could you please provide more details?",
      category: "follow_up",
    },
    {
      title: "Ticket resolved",
      content:
        "Hello, we are pleased to inform you that your inquiry has been resolved. If you have any further questions, feel free to contact us.",
      category: "resolution",
    },
  ],
};

async function seedDefaults(accountId: string, locale: "es" | "en"): Promise<void> {
  const rows = DEFAULT_TEMPLATES[locale].map((t) => ({
    account_id: accountId,
    locale,
    ...t,
  }));
  await supabase.from("response_templates").insert(rows);
}

// ---------------------------------------------------------------------------
// GET /v1/templates — list active templates; seed defaults on first request
// ---------------------------------------------------------------------------

templates.get("/", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const locale = resolveLocale(c.req.header("Accept-Language"));

  const { data, error, count } = await supabase
    .from("response_templates")
    .select("*", { count: "exact" })
    .eq("account_id", ctx.accountId)
    .eq("locale", locale)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) return c.json({ error: error.message }, 500);

  if ((count ?? 0) === 0) {
    await seedDefaults(ctx.accountId, locale);
    const { data: seeded } = await supabase
      .from("response_templates")
      .select("*")
      .eq("account_id", ctx.accountId)
      .eq("locale", locale)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    return c.json({ data: seeded ?? [] });
  }

  return c.json({ data: data ?? [] });
});

// ---------------------------------------------------------------------------
// POST /v1/templates — create template
// ---------------------------------------------------------------------------

const CreateTemplateSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  category: z.string().max(100).optional(),
  locale: z.enum(["es", "en"]).default("es"),
});

templates.post("/", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = CreateTemplateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);

  const { data, error } = await supabase
    .from("response_templates")
    .insert({
      account_id: ctx.accountId,
      title:      parsed.data.title,
      content:    parsed.data.content,
      category:   parsed.data.category ?? null,
      locale:     parsed.data.locale,
    })
    .select("*")
    .single();

  if (error || !data) return c.json({ error: "Failed to create template" }, 500);

  return c.json(data, 201);
});

// ---------------------------------------------------------------------------
// PUT /v1/templates/:id — update template
// ---------------------------------------------------------------------------

const UpdateTemplateSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content: z.string().min(1).optional(),
  category: z.string().max(100).nullable().optional(),
  locale: z.enum(["es", "en"]).optional(),
});

templates.put("/:id", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON body" }, 400); }

  const parsed = UpdateTemplateSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid request", detail: parsed.error.flatten() }, 400);

  if (Object.keys(parsed.data).length === 0) {
    return c.json({ error: "No fields to update" }, 400);
  }

  const { data, error } = await supabase
    .from("response_templates")
    .update(parsed.data)
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .select("*")
    .single();

  if (error || !data) return c.json({ error: "Template not found" }, 404);

  return c.json(data);
});

// ---------------------------------------------------------------------------
// DELETE /v1/templates/:id — soft delete (is_active = false)
// ---------------------------------------------------------------------------

templates.delete("/:id", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");

  const { data, error } = await supabase
    .from("response_templates")
    .update({ is_active: false })
    .eq("id", id)
    .eq("account_id", ctx.accountId)
    .select("id")
    .single();

  if (error || !data) return c.json({ error: "Template not found" }, 404);

  return c.json({ deleted: true, id });
});
