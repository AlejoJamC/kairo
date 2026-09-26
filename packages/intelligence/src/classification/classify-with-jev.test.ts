import { describe, it, expect, mock } from 'bun:test';

import type { DecisionProvider } from '../providers/decision';
import { classifyEmailWithJev } from './classify-with-jev';
import { NO_REASONING } from '../providers/jev/ticket-verdict';

function answer(choiceValue: string, confidence: number) {
  return { type: 'choice' as const, choice: choiceValue, confidence };
}

function fakeJev(answers: Record<string, ReturnType<typeof answer>>): DecisionProvider {
  return {
    provider: 'jev',
    model: 'jev-latest',
    decide: mock(async () => ({
      value: answers,
      confidence: null,
      provider: 'jev',
      modelVersion: 'jev-latest',
      latencyMs: 5,
      rawMetadata: { usage: { input_tokens: 20, output_tokens: 6 } },
    })) as DecisionProvider['decide'],
  };
}

describe('classifyEmailWithJev', () => {
  it('derives the same ticket_type table every other provider uses — external + needs_action + service = support', async () => {
    const provider = fakeJev({
      actionability: answer('needs_action', 0.95),
      subject_matter: answer('service', 0.9),
      priority: answer('P2', 0.9),
      category: answer('technical', 0.9),
      tone: answer('neutral', 0.9),
      urgency: answer('medium', 0.9),
    });

    const { result, verdict } = await classifyEmailWithJev(
      { subject: 'Cannot log in', body: 'I cannot access my account', from: 'client@outside.com' },
      provider,
    );

    expect(result.type).toBe('support');
    expect(result.priority).toBe('P2');
    expect(result.category).toBe('technical');
    expect(result.tone).toBe('neutral');
    expect(result.urgency).toBe('medium');
    expect(result.confidence).toBe(0.9);
    expect(result.reasoning).toBe(NO_REASONING);
    expect(verdict.subject_matter).toBe('service');
  });

  it('a message with no headers falls back to external provenance, same as every other classify path', async () => {
    const provider = fakeJev({
      actionability: answer('fyi', 0.9),
      subject_matter: answer('admin', 0.9),
      priority: answer('P3', 0.9),
      category: answer('general', 0.9),
      tone: answer('neutral', 0.9),
      urgency: answer('low', 0.9),
    });

    const { result } = await classifyEmailWithJev(
      { subject: 'FYI', body: 'housekeeping note', from: 'someone@acme.com' },
      provider,
    );

    // external|fyi|admin -> internal, per classification/derive.ts's TYPE_DERIVATION.
    expect(result.type).toBe('internal');
  });

  it('sends the message as structured state, not a rendered prompt', async () => {
    const provider = fakeJev({
      actionability: answer('needs_action', 0.9),
      subject_matter: answer('service', 0.9),
      priority: answer('P1', 0.9),
      category: answer('technical', 0.9),
      tone: answer('aggressive', 0.9),
      urgency: answer('high', 0.9),
    });

    await classifyEmailWithJev(
      { subject: 'Down', body: 'production is down', from: 'cto@acme.com', tenantMailbox: 'support@kairo.dev' },
      provider,
    );

    const call = (provider.decide as ReturnType<typeof mock>).mock.calls[0]![0] as { state: Record<string, unknown> };
    expect(call.state).toMatchObject({
      subject: 'Down',
      body: 'production is down',
      from: 'cto@acme.com',
      tenantMailbox: 'support@kairo.dev',
    });
  });
});
