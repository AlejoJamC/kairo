// KAI-42: KB articles CRUD (ADR-022: migrated from user_id to account_id).
//
//   GET    /v1/kb-articles            → list tenant's articles (no embedding column)
//   GET    /v1/kb-articles/:id        → single article
//   POST   /v1/kb-articles            → create + generate embedding (fire-and-forget)
//   PUT    /v1/kb-articles/:id        → update; regenerate embedding if title or content changed
//   DELETE /v1/kb-articles/:id        → remove

import { Hono } from "hono";
import { z } from "zod";
import { supabase } from "../../lib/supabase.js";
import { resolveUserAndAccount } from "../../lib/auth.js";
import { requestSemanticIndexing } from "../../lib/semantic-indexing.js";

export const kbArticles = new Hono();

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

kbArticles.get('/:id/evidence', async c => {
  const ctx = await resolveUserAndAccount(c.req.header('Authorization') ?? '');
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401);
  const { data: article, error } = await supabase.from('kb_articles').select('tags')
    .eq('id', c.req.param('id')).eq('account_id', ctx.accountId).maybeSingle();
  if (error) return c.json({ error: 'Knowledge evidence unavailable' }, 503);
  if (!article) return c.json({ error: 'Not found' }, 404);
  const ids = (article.tags ?? []).filter((tag: string) => tag.startsWith('llm-call:')).map((tag: string) => tag.slice(9));
  if (!ids.length) return c.json({ steps: [], evidence: [] });
  const { data: calls, error: callsError } = await supabase.from('llm_calls')
    .select('feature, model, prompt_version, prompt_text, created_at')
    .eq('account_id', ctx.accountId).in('id', ids).order('created_at', { ascending: true });
  if (callsError) return c.json({ error: 'Knowledge evidence unavailable' }, 503);
  const EvidenceState = z.object({ state: z.object({ proposals: z.array(z.object({ evidence: z.array(z.string()) })) }) });
  const proposalIndex = Number((article.tags ?? []).find((tag: string) => tag.startsWith('proposal-index:'))?.slice(15));
  const evidence: string[] = [];
  for (const call of calls ?? []) {
    if (call.feature !== 'email_knowledge_validation') continue;
    try {
      const parsed = EvidenceState.safeParse(JSON.parse(call.prompt_text));
      if (parsed.success && Number.isInteger(proposalIndex) && proposalIndex >= 0) {
        evidence.push(...(parsed.data.state.proposals[proposalIndex]?.evidence ?? []));
      }
    } catch { /* An unavailable audit record does not fabricate evidence. */ }
  }
  return c.json({ steps: (calls ?? []).map(call => ({ feature: call.feature, model: call.model, version: call.prompt_version })), evidence });
});

// ---------------------------------------------------------------------------
// GET /v1/kb-articles
// ---------------------------------------------------------------------------

kbArticles.get("/", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const { data, error } = await supabase
    .from("kb_articles")
    .select(SAFE_COLUMNS)
    .eq("account_id", ctx.accountId)
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
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const { data, error } = await supabase
    .from("kb_articles")
    .select(SAFE_COLUMNS)
    .eq("account_id", ctx.accountId)
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
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

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
      account_id:   ctx.accountId,
      reviewed_by: ctx.userId,
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

  await requestSemanticIndexing(supabase, ctx.accountId, [{ kind: 'kb_article', id: data.id }]).catch((err: unknown) => {
    console.error(`[kb-articles] embedding failed for ${data.id}:`, err);
  });

  return c.json(data, 201);
});

// ---------------------------------------------------------------------------
// PUT /v1/kb-articles/:id
// ---------------------------------------------------------------------------

kbArticles.put("/:id", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

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

  const updates: Record<string, unknown> = { reviewed_by: ctx.userId, updated_at: new Date().toISOString() };
  if (parsed.data.title        !== undefined) updates.title = parsed.data.title;
  if (parsed.data.content      !== undefined) updates.content = parsed.data.content;
  if (parsed.data.tags         !== undefined) updates.tags = parsed.data.tags;
  if (parsed.data.is_published !== undefined) updates.is_published = parsed.data.is_published;

  const { data, error } = await supabase
    .from("kb_articles")
    .update(updates)
    .eq("account_id", ctx.accountId)
    .eq("id", id)
    .select(SAFE_COLUMNS)
    .maybeSingle();

  if (error) {
    return c.json({ error: "Failed to update article", detail: error.message }, 500);
  }
  if (!data) return c.json({ error: "Not found" }, 404);

  const titleChanged   = parsed.data.title !== undefined;
  const contentChanged = parsed.data.content !== undefined;
  if (titleChanged || contentChanged) {
    await requestSemanticIndexing(supabase, ctx.accountId, [{ kind: 'kb_article', id: data.id }]).catch((err: unknown) => {
      console.error(`[kb-articles] embedding refresh failed for ${data.id}:`, err);
    });
  }

  return c.json(data);
});

// ---------------------------------------------------------------------------
// DELETE /v1/kb-articles/:id
// ---------------------------------------------------------------------------

kbArticles.delete("/:id", async (c) => {
  const ctx = await resolveUserAndAccount(c.req.header("Authorization") ?? "");
  if (!ctx) return c.json({ error: "Unauthorized" }, 401);

  const id = c.req.param("id");
  const { error, count } = await supabase
    .from("kb_articles")
    .delete({ count: "exact" })
    .eq("account_id", ctx.accountId)
    .eq("id", id);

  if (error) {
    return c.json({ error: "Failed to delete article", detail: error.message }, 500);
  }
  if (count === 0) return c.json({ error: "Not found" }, 404);
  return c.body(null, 204);
});
