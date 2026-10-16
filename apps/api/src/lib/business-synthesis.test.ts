import { describe, expect, it, mock } from 'bun:test';
// Application modules validate their environment on import; synthetic values keep this suite independent of file order.
process.env['SUPABASE_URL'] ??= 'http://localhost:54321';
process.env['SUPABASE_SERVICE_ROLE_KEY'] ??= 'synthetic-service-role-key';
const { persistSynthesis, synthesizeBusiness, SYNTHESIS_REVIEW_LIMIT } = await import('./business-synthesis');
const { BUSINESS_SYNTHESIS_CONTRACT } = await import('@kairo/intelligence');

function database(accountTickets: string[]) {
  const saved: { row: Record<string, unknown>; options: unknown }[] = [];
  const db = { from: (table: string) => {
    if (table === 'operational_learning') return { upsert: async (row: Record<string, unknown>, options: unknown) => { saved.push({ row, options }); return { error: null }; } };
    let ids: string[] = [];
    const chain = {
      select: () => chain, eq: () => chain,
      in: (_column: string, values: string[]) => { ids = values; return chain; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: ids.filter((id) => accountTickets.includes(id)).map((id) => ({ id })), error: null }).then(resolve),
    };
    return chain;
  } };
  return { db: db as never, saved };
}
const provenance = { model: 'synthesis-model', promptVersion: '1.0.0', scope: 'onboarding' as const };
const theme = (name: string, ticketIds: string[]) => ({ name, description: `${name} cases.`, ticketIds });

describe('persisting a synthesis', () => {
  it('keeps only evidence from the account and themes with at least two tickets', async () => {
    const { db, saved } = database(['t1', 't2', 't3']);
    const result = await persistSynthesis('account', {
      profile: { summary: 'Acme delivers support software to small companies.', evidenceTicketIds: ['t1', 'foreign'] },
      themes: [theme('Account access', ['t1', 't2', 'foreign']), theme('Billing', ['t3', 'foreign'])],
      missing: ['customer_segments'],
    }, provenance, db);
    expect(result).toEqual({ profile: true, themes: 1, droppedThemes: 1, missing: ['customer_segments'] });
    expect(saved.map(({ row }) => [row['source_key'], row['learning_type'], row['ticket_ids'], row['status']])).toEqual([
      ['business-profile', 'business_fact', ['t1'], 'pending_review'],
      ['theme:account-access', 'diagnostic_pattern', ['t1', 't2'], 'pending_review'],
    ]);
    expect(saved.every(({ options }) => JSON.stringify(options) === JSON.stringify({ onConflict: 'account_id,source_key', ignoreDuplicates: true }))).toBe(true);
  });

  it('sends the owner at most the profile and the largest themes', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `t${i}`);
    const { db, saved } = database(ids);
    await persistSynthesis('account', {
      profile: { summary: 'Acme delivers support software.', evidenceTicketIds: ['t0'] },
      themes: [2, 6, 3, 5, 4, 2].map((size, index) => theme(`Theme ${index}`, ids.slice(0, size))),
      missing: [],
    }, provenance, db);
    expect(saved).toHaveLength(SYNTHESIS_REVIEW_LIMIT);
    expect(saved.slice(1).map(({ row }) => row['source_count'])).toEqual([6, 5, 4, 3]);
  });

  it('stores no profile when the conversations do not establish one', async () => {
    const { db, saved } = database(['t1', 't2']);
    const result = await persistSynthesis('account', { profile: null, themes: [theme('Acceso a la cuenta', ['t1', 't2'])], missing: ['business_profile'] }, provenance, db);
    expect(result.profile).toBe(false);
    expect(saved.map(({ row }) => row['source_key'])).toEqual(['theme:acceso-a-la-cuenta']);
  });
});

describe('running the synthesis block', () => {
  it('gives the agent exactly its contract tools and persists inside a memoized step', async () => {
    const { db, saved } = database(['t1', 't2']);
    const steps: string[] = [];
    const runAgent = mock(async (_contract: unknown, request: { tools: { name: string }[]; messages: { content: string }[] }) => ({
      text: '', steps: 3, operations: [], model: 'synthesis-model', promptVersion: '1.0.0', usage: { promptTokens: 1, completionTokens: 1 },
      finishReason: 'stop', costUsd: null, inferenceProvider: null, credentialType: null,
      output: { profile: null, themes: [theme('Account access', ['t1', 't2'])], missing: [] },
      request,
    }));
    const result = await synthesizeBusiness({ accountId: 'account', scope: 'onboarding' }, {
      db, logger: async () => null, runAgent: runAgent as never,
      tenantSettings: async () => ({ language: 'es', businessContext: undefined }),
      steps: async (id, run) => { steps.push(id); return run(); },
    });
    const [contract, request] = runAgent.mock.calls[0]!;
    expect(contract).toBe(BUSINESS_SYNTHESIS_CONTRACT);
    expect(request.tools.map((definition) => definition.name)).toEqual([...BUSINESS_SYNTHESIS_CONTRACT.tools]);
    expect(request.messages[0]?.content).toContain('onboarding');
    expect(steps).toEqual(['business_synthesis:persist']);
    expect(result).toEqual({ profile: false, themes: 1, droppedThemes: 0, missing: [] });
    expect(saved).toHaveLength(1);
  });
});
