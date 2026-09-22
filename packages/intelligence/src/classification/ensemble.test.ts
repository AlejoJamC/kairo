// ---------------------------------------------------------------------------
// KAI-45 F3 — the ensemble's second opinion, wired through classifyEmailWithMeta.
//
// Both providers are replaced so the test can say exactly what each model
// answered and check only what classify does with the two answers. What is
// pinned:
//
//   - no ensemble configured → no second call, no abstention
//   - the two models derive the same type → no abstention, even when their
//     axes differ, because a difference that changes no label is not one a
//     human could act on
//   - they derive different types → abstain
//   - the second model fails → the primary stands and nothing abstains
//
// The threshold is not a number here and that is deliberate: with two models
// the only rule is "any disagreement on the type". Where to cut when there are
// more signals is S5 in KAI-54, and this test does not pretend to know it.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterAll, mock } from 'bun:test';

import { resolveEnsembleTarget } from '../config/ensemble';
import type { ModelVerdictResult } from './schema';

type Target = { provider: 'ollama' | 'anthropic'; model: string } | null;

const verdict = (over: Partial<ModelVerdictResult>): ModelVerdictResult => ({
  actionability: 'needs_action',
  subject_matter: 'service',
  priority: 'P2',
  category: 'general',
  tone: 'neutral',
  urgency: 'medium',
  reasoning: 'r',
  confidence: 0.8,
  ...over,
});

let primaryAnswer: ModelVerdictResult = verdict({});
let secondAnswer: ModelVerdictResult | Error = verdict({});
let secondCalls = 0;

const fakeProvider = (model: string, answer: () => ModelVerdictResult | Error) => ({
  model,
  completeJSONWithMeta: async () => {
    const a = answer();
    if (a instanceof Error) throw a;
    return { data: a, rawText: '{}', model, usage: { promptTokens: null, completionTokens: null }, tokensPerSecond: null };
  },
});

// Only the provider factory is replaced. Which second model to ask comes from
// the real parser reading INTELLIGENCE_ENSEMBLE, so the wiring under test is the
// one production runs. A module mock in bun reaches every file in the same run,
// which is why the parser lives in its own module and is re-exported here as
// itself rather than stubbed.
mock.module('../config/providers', () => ({
  resolveEnsembleTarget,
  createCompletionProvider: (target?: Target) => {
    if (!target) return fakeProvider('primary-model', () => primaryAnswer);
    secondCalls++;
    return fakeProvider(target.model, () => secondAnswer);
  },
}));

const { classifyEmailWithMeta } = await import('./classify');

// No facts: provenance falls back to `external`, which fixes the derivation row
// and leaves the two axes as the only thing that moves the type.
const message = { subject: 'S', body: 'B', from: 'someone@outside.com' };

const ORIGINAL = process.env['INTELLIGENCE_ENSEMBLE'];
const useEnsemble = (value: string | null) => {
  if (value === null) delete process.env['INTELLIGENCE_ENSEMBLE'];
  else process.env['INTELLIGENCE_ENSEMBLE'] = value;
};

beforeEach(() => {
  primaryAnswer = verdict({});
  secondAnswer = verdict({});
  useEnsemble(null);
  secondCalls = 0;
});

afterAll(() => useEnsemble(ORIGINAL ?? null));

describe('classification ensemble', () => {
  it('asks nobody else when no ensemble is configured', async () => {
    const out = await classifyEmailWithMeta(message);

    expect(secondCalls).toBe(0);
    expect(out.abstain).toBe(false);
    expect(out.ensemble).toBeNull();
  });

  it('does not abstain when both models derive the same type', async () => {
    useEnsemble('ollama:second-model');

    const out = await classifyEmailWithMeta(message);

    expect(secondCalls).toBe(1);
    expect(out.result.type).toBe('support');
    expect(out.ensemble).toEqual({ model: 'second-model', type: 'support' });
    expect(out.abstain).toBe(false);
  });

  // Commercial mail derives the same type whatever the actionability, so the
  // two models disagreeing on that axis changes nothing anyone downstream sees.
  it('does not abstain when the axes differ but the type does not', async () => {
    useEnsemble('ollama:second-model');
    primaryAnswer = verdict({ actionability: 'needs_action', subject_matter: 'commercial_demand' });
    secondAnswer = verdict({ actionability: 'fyi', subject_matter: 'commercial_demand' });

    const out = await classifyEmailWithMeta(message);

    expect(out.result.type).toBe('prospect');
    expect(out.ensemble?.type).toBe('prospect');
    expect(out.abstain).toBe(false);
  });

  it('abstains when the two models derive different types', async () => {
    useEnsemble('anthropic:second-model');
    primaryAnswer = verdict({ subject_matter: 'service' });
    secondAnswer = verdict({ subject_matter: 'commercial_offer' });

    const out = await classifyEmailWithMeta(message);

    // The classification returned is still the primary's; abstaining changes
    // where it goes, not what it says.
    expect(out.result.type).toBe('support');
    expect(out.ensemble?.type).toBe('other');
    expect(out.abstain).toBe(true);
  });

  // An opinion that never arrived is not a disagreement, and a second model
  // being down must not take the first one's answer with it.
  it('keeps the primary and does not abstain when the second model fails', async () => {
    useEnsemble('ollama:second-model');
    secondAnswer = new Error('connection refused');

    const out = await classifyEmailWithMeta(message);

    expect(out.result.type).toBe('support');
    expect(out.ensemble).toBeNull();
    expect(out.abstain).toBe(false);
  });
});
