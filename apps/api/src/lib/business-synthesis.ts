import {
  BUSINESS_SYNTHESIS_CONTRACT, runAgent,
  type AgentStepRunner, type BusinessSynthesis,
} from '@kairo/intelligence';
import { contractTools, sharedAgentTools, type AgentToolDeps } from './agent-tools.js';
import { resolveTenantSettings } from './classifier-input.js';
import { recordLlmCall } from './llm-logging.js';
import { supabase } from './supabase.js';

/** The account's single business profile proposal; an approved one feeds the business context. */
export const BUSINESS_PROFILE_KEY = 'business-profile';
/** At most this many items reach the owner from one synthesis: the profile plus the largest themes. */
export const SYNTHESIS_REVIEW_LIMIT = 5;

export type SynthesisScope = 'onboarding';

export interface SynthesisDeps extends AgentToolDeps {
  runAgent?: typeof runAgent;
  steps?: AgentStepRunner;
}

const REQUEST: Record<'es' | 'en' | 'pt', string> = {
  es: 'Sintetiza el negocio a partir de la muestra del onboarding: los tickets del tier 1.',
  en: 'Synthesize the business from the onboarding sample: the tickets of tier 1.',
  pt: 'Synthesize the business from the onboarding sample: the tickets of tier 1.',
};

const slug = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/** Runs the synthesis block over the account's onboarding sample and stores what survives validation for the owner's review. */
export async function synthesizeBusiness(input: { accountId: string; scope: SynthesisScope }, deps: SynthesisDeps = {}) {
  const db = deps.db ?? supabase;
  const logger = deps.logger ?? recordLlmCall;
  const steps: AgentStepRunner = deps.steps ?? ((_id, run) => run());
  const settings = await (deps.tenantSettings ?? resolveTenantSettings)(input.accountId, db);
  const registry = sharedAgentTools({ feature: BUSINESS_SYNTHESIS_CONTRACT.feature, accountId: input.accountId }, { ...deps, db, logger });
  const run = await (deps.runAgent ?? runAgent)(BUSINESS_SYNTHESIS_CONTRACT, {
    lang: settings.language, messages: [{ role: 'user', content: REQUEST[settings.language] }],
    tools: contractTools(BUSINESS_SYNTHESIS_CONTRACT, registry), context: { accountId: input.accountId }, logger, steps,
  });
  if (!run.output) throw new Error('Business synthesis returned no typed answer');
  const synthesis = run.output;
  return steps(`${BUSINESS_SYNTHESIS_CONTRACT.feature}:persist`, () => persistSynthesis(input.accountId, synthesis,
    { model: run.model, promptVersion: run.promptVersion, scope: input.scope }, db));
}

/**
 * Code, not the model, decides what is stored: only tickets of this account
 * count as evidence, a theme needs two of them, and the owner receives at most
 * {@link SYNTHESIS_REVIEW_LIMIT} items. Existing proposals are never overwritten,
 * so a person's decision on them stands.
 */
export async function persistSynthesis(accountId: string, synthesis: BusinessSynthesis,
  provenance: { model: string; promptVersion: string | null; scope: SynthesisScope }, db = supabase) {
  const cited = [...new Set([...(synthesis.profile?.evidenceTicketIds ?? []), ...synthesis.themes.flatMap((theme) => theme.ticketIds)])];
  const { data: rows, error } = cited.length
    ? await db.from('tickets').select('id').eq('account_id', accountId).in('id', cited)
    : { data: [], error: null };
  if (error) throw new Error('Synthesis evidence lookup failed');
  const known = new Set((rows ?? []).map((row) => row.id as string));
  const valid = (ids: string[]) => [...new Set(ids.filter((id) => known.has(id)))];

  const profileEvidence = synthesis.profile ? valid(synthesis.profile.evidenceTicketIds) : [];
  const profile = synthesis.profile && profileEvidence.length ? { ...synthesis.profile, evidenceTicketIds: profileEvidence } : null;
  const byKey = new Map<string, BusinessSynthesis['themes'][number]>();
  for (const theme of synthesis.themes.map((item) => ({ ...item, ticketIds: valid(item.ticketIds) })).filter((item) => item.ticketIds.length >= 2)) {
    const key = slug(theme.name);
    const existing = byKey.get(key);
    if (key && (!existing || existing.ticketIds.length < theme.ticketIds.length)) byKey.set(key, theme);
  }
  const themes = [...byKey.entries()].sort(([, a], [, b]) => b.ticketIds.length - a.ticketIds.length)
    .slice(0, SYNTHESIS_REVIEW_LIMIT - (profile ? 1 : 0));

  const proposals = [
    ...(profile ? [{ account_id: accountId, origin: 'system_derived', status: 'pending_review', learning_type: 'business_fact',
      summary: profile.summary, ticket_ids: profile.evidenceTicketIds, source_count: profile.evidenceTicketIds.length,
      confidence: null, source_key: BUSINESS_PROFILE_KEY, evidence: { kind: 'business_profile', ...provenance } }] : []),
    ...themes.map(([key, theme]) => ({ account_id: accountId, origin: 'system_derived', status: 'pending_review',
      learning_type: 'diagnostic_pattern', summary: `${theme.name}: ${theme.description}`, ticket_ids: theme.ticketIds,
      source_count: theme.ticketIds.length, confidence: null, source_key: `theme:${key}`,
      evidence: { kind: 'theme', title: theme.name, ...provenance } })),
  ];
  for (const proposal of proposals) {
    const { error: saveError } = await db.from('operational_learning').upsert(proposal, { onConflict: 'account_id,source_key', ignoreDuplicates: true });
    if (saveError) throw new Error('Synthesis proposal persistence failed');
  }
  return { profile: Boolean(profile), themes: themes.length,
    droppedThemes: synthesis.themes.length - themes.length, missing: synthesis.missing };
}
