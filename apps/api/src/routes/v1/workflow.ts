import { Hono } from 'hono';
import { z } from 'zod';
import { supabase } from '../../lib/supabase.js';
import { resolveUserAndAccount, resolveMemberRole } from '../../lib/auth.js';
import { isRoleAllowed } from '../../middleware/rbac-check.js';
import { maybeGenerateKbEmbedding } from '../../lib/kb-embedding.js';

export const workflow = new Hono();
const UUID = z.string().uuid();
workflow.post('/tickets/:id/viewed', async c => {
  const ctx = await resolveUserAndAccount(c.req.header('Authorization') ?? '');
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401);
  if (!UUID.safeParse(c.req.param('id')).success) return c.json({ error: 'Invalid ticket' }, 400);
  const { error } = await supabase.rpc('mark_ticket_viewed', { p_account_id: ctx.accountId, p_ticket_id: c.req.param('id'), p_user_id: ctx.userId });
  return error ? c.json({ error: 'Unable to record ticket view' }, 503) : c.body(null, 204);
});
workflow.get('/tickets/:id', async c => {
  const ctx = await resolveUserAndAccount(c.req.header('Authorization') ?? '');
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401);
  const { data, error } = await supabase.from('ticket_decision_history').select('*').eq('account_id', ctx.accountId).eq('ticket_id', c.req.param('id')).order('created_at', { ascending: false }).limit(50);
  return error ? c.json({ error: 'Decision history unavailable' }, 503) : c.json({ decisions: data });
});
workflow.get('/knowledge', async c => {
  const ctx = await resolveUserAndAccount(c.req.header('Authorization') ?? '');
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401);
  const { data, error } = await supabase.from('latest_knowledge').select('*').eq('account_id', ctx.accountId).order('revision', { ascending: false });
  if (error) return c.json({ error: 'Knowledge unavailable' }, 503);
  const seen = new Set<string>();
  const articles = (data ?? []).flatMap(row => {
    const key = `${row.source_kind}:${row.source_id}`;
    if (seen.has(key)) return [];
    seen.add(key);
    if (['rejected', 'withdrawn'].includes(row.status)) return [];
    const snapshot = row.snapshot;
    const evidence = snapshot.evidence ?? {};
    return [{ id: row.source_id, kind: row.source_kind, versionId: row.id,
      title: snapshot.title ?? evidence.title ?? snapshot.learning_type, content: snapshot.content ?? snapshot.summary,
      tags: snapshot.tags ?? [`type:${evidence.kind ?? 'business_fact'}`],
      is_published: row.status === 'approved', updated_at: row.created_at,
      evidence: evidence.quotes ?? [], sources: evidence.versions ?? [],
    }];
  });
  return c.json({ articles });
});
const Review = z.object({ kind: z.enum(['article','learning']), versionId: UUID,
  decision: z.enum(['approved','rejected','pending_review']), title: z.string().min(1).max(500).optional(), content: z.string().min(1).max(6000).optional() });
workflow.post('/knowledge/:id/review', async c => {
  const ctx = await resolveUserAndAccount(c.req.header('Authorization') ?? '');
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401);
  const role = await resolveMemberRole(ctx.userId, ctx.accountId);
  if (!isRoleAllowed(role ? { role, status: 'active' } : null, ['owner','admin','supervisor','agent'])) return c.json({ error: 'Forbidden' }, 403);
  const parsed = Review.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success || !UUID.safeParse(c.req.param('id')).success) return c.json({ error: 'Invalid review' }, 400);
  const value = parsed.data;
  const { error } = await supabase.rpc('review_workflow_knowledge', { p_account_id: ctx.accountId, p_user_id: ctx.userId,
    p_kind: value.kind, p_id: c.req.param('id'), p_version_id: value.versionId, p_decision: value.decision,
    p_title: value.title ?? null, p_content: value.content ?? null });
  if (error) return c.json({ error: 'Review conflict or permission denied; refresh before retrying' }, 409);
  if (value.kind === 'article' && value.title && value.content) {
    await maybeGenerateKbEmbedding({ supabase, articleId: c.req.param('id'), accountId: ctx.accountId, title: value.title, content: value.content });
  }
  return c.json({ status: value.decision });
});

workflow.post('/tickets/:id/decisions/:decisionId/review', async c => {
  const ctx = await resolveUserAndAccount(c.req.header('Authorization') ?? '');
  if (!ctx) return c.json({ error: 'Unauthorized' }, 401);
  const input = z.object({ accept: z.boolean() }).safeParse(await c.req.json().catch(() => null));
  if (!input.success || !UUID.safeParse(c.req.param('id')).success || !UUID.safeParse(c.req.param('decisionId')).success) return c.json({ error: 'Invalid review' },400);
  const { error } = await supabase.rpc('review_ticket_enrichment', { p_account_id:ctx.accountId,p_ticket_id:c.req.param('id'),p_user_id:ctx.userId,p_decision_id:c.req.param('decisionId'),p_accept:input.data.accept });
  return error ? c.json({ error:'Proposal changed or permission denied' },409) : c.body(null,204);
});
workflow.get('/metrics', async c => {
  const ctx = await resolveUserAndAccount(c.req.header('Authorization') ?? '');
  if (!ctx) return c.json({ error:'Unauthorized' },401);
  const [measurements,coverage] = await Promise.all([
    supabase.from('workflow_metrics').select('*').eq('account_id',ctx.accountId),
    supabase.from('knowledge_enrichment_coverage').select('*').eq('account_id',ctx.accountId).maybeSingle(),
  ]);
  if (measurements.error || coverage.error) return c.json({error:'Metrics unavailable'},503);
  return c.json({metrics:measurements.data,coverage:coverage.data,monetaryCost:null});
});
