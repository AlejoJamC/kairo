// KAI-42: KB articles CRUD.
//
//   GET    /v1/kb-articles            → list tenant's articles (no embedding column)
//   GET    /v1/kb-articles/:id        → single article
//   POST   /v1/kb-articles            → create + generate embedding (fire-and-forget)
//   PUT    /v1/kb-articles/:id        → update; regenerate embedding if title or content changed
//   DELETE /v1/kb-articles/:id        → remove
//
// Tenant isolation = user_id. Embedding generation is fire-and-forget so the
// HTTP response is not blocked on a Voyage API call (matches KAI-42 AC: "Voyage
// AI call does not block ticket classification" — same principle for KB writes).

import { Hono } from "hono";
import { z } from "zod";
import { supabase } from "../../lib/supabase.js";
import { maybeGenerateKbEmbedding } from "../../lib/kb-embedding.js";

export const kbArticles = new Hono();

async function resolveUser(authHeader: string) {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

const CreateArticleSchema = z.object({
  title:        z.string().min(1).max(500),
  content:      z.string().min(1),
  tags:         z.array(z.string()).optional(),
  is_published: z.boolean().optional(),
});

const UpdateArticleSchema = z.object({
  title:        z.string().min(1).max(500).optional(),
  content:      z.string().min(1).optional(),
  tags:         z.array(z.string()).optional(),
  is_published: z.boolean().optional(),
}).refine(
  (v) => v.title !== undefined || v.content !== undefined ||
         v.tags !== undefined  || v.is_published !== undefined,
  { message: "At least one field must be provided" }
);

const SAFE_COLUMNS = "id, title, content, tags, is_published, created_at, updated_at";

// ---------------------------------------------------------------------------
// GET /v1/kb-articles
// ---------------------------------------------------------------------------

kbArticles.get("/", async (c) => {
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const { data, error } = await supabase
    .from("kb_articles")
    .select(SAFE_COLUMNS)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return c.json({ error: "Failed to load articles", detail: error.message }, 500);
  }
  return c.json({ articles: data ?? [] });
});

// ---------------------------------------------------------------------------
// GET /v1/kb-articles/:id
// ---------------------------------------------------------------------------

kbArticles.get("/:id", async (c) => {
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const { data, error } = await supabase
    .from("kb_articles")
    .select(SAFE_COLUMNS)
    .eq("user_id", user.id)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return c.json({ error: "Failed to load article", detail: error.message }, 500);
  }
  if (!data) return c.json({ error: "Not found" }, 404);
  return c.json(data);
});

// ---------------------------------------------------------------------------
// POST /v1/kb-articles
// ---------------------------------------------------------------------------

kbArticles.post("/", async (c) => {
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = CreateArticleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid article", detail: parsed.error.flatten() }, 400);
  }

  const { data, error } = await supabase
    .from("kb_articles")
    .insert({
      user_id:      user.id,
      title:        parsed.data.title,
      content:      parsed.data.content,
      tags:         parsed.data.tags ?? null,
      is_published: parsed.data.is_published ?? true,
    })
    .select(SAFE_COLUMNS)
    .single();

  if (error || !data) {
    return c.json({ error: "Failed to create article", detail: error?.message }, 500);
  }

  maybeGenerateKbEmbedding({
    supabase,
    articleId: data.id,
    title: parsed.data.title,
    content: parsed.data.content,
  }).catch((err: unknown) => {
    console.error(`[kb-articles] embedding failed for ${data.id}:`, err);
  });

  return c.json(data, 201);
});

// ---------------------------------------------------------------------------
// PUT /v1/kb-articles/:id
// ---------------------------------------------------------------------------

kbArticles.put("/:id", async (c) => {
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = UpdateArticleSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid update", detail: parsed.error.flatten() }, 400);
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.title        !== undefined) updates.title = parsed.data.title;
  if (parsed.data.content      !== undefined) updates.content = parsed.data.content;
  if (parsed.data.tags         !== undefined) updates.tags = parsed.data.tags;
  if (parsed.data.is_published !== undefined) updates.is_published = parsed.data.is_published;

  const { data, error } = await supabase
    .from("kb_articles")
    .update(updates)
    .eq("user_id", user.id)
    .eq("id", id)
    .select(SAFE_COLUMNS)
    .maybeSingle();

  if (error) {
    return c.json({ error: "Failed to update article", detail: error.message }, 500);
  }
  if (!data) return c.json({ error: "Not found" }, 404);

  // Regenerate embedding only when text content changed.
  const titleChanged   = parsed.data.title !== undefined;
  const contentChanged = parsed.data.content !== undefined;
  if (titleChanged || contentChanged) {
    maybeGenerateKbEmbedding({
      supabase,
      articleId: data.id,
      title: data.title,
      content: data.content,
    }).catch((err: unknown) => {
      console.error(`[kb-articles] embedding refresh failed for ${data.id}:`, err);
    });
  }

  return c.json(data);
});

// ---------------------------------------------------------------------------
// DELETE /v1/kb-articles/:id
// ---------------------------------------------------------------------------

kbArticles.delete("/:id", async (c) => {
  const user = await resolveUser(c.req.header("Authorization") ?? "");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const { error, count } = await supabase
    .from("kb_articles")
    .delete({ count: "exact" })
    .eq("user_id", user.id)
    .eq("id", id);

  if (error) {
    return c.json({ error: "Failed to delete article", detail: error.message }, 500);
  }
  if (count === 0) return c.json({ error: "Not found" }, 404);
  return c.body(null, 204);
});
