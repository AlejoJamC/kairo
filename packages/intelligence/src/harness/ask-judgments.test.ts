import { expect, it } from 'bun:test';
import { askJudgments } from './ask-judgments';
import type { DecisionProvider } from '../providers/decision';

it('builds choice, score and noul questions for the decision model', async () => {
  let received: { state: unknown; questions: unknown } | undefined;
  const provider: DecisionProvider = { provider: 'gateway', model: 'decision-model', decide: async (input) => {
    received = { state: input.state, questions: input.questions };
    return { value: { failure: { type: 'noul', noul: 0.8 } } as never, confidence: null, provider: 'gateway', modelVersion: 'decision-model', latencyMs: 1 };
  } };
  const result = await askJudgments({ state: { message: 'The delivery never arrived.' }, questions: [
    { id: 'failure', type: 'noul', instructions: 'Does the sender report a failed delivery?' },
    { id: 'dissatisfaction', type: 'score', instructions: 'How much dissatisfaction does the sender express?', levels: ['None.', 'Some.', 'Strong.'] },
    { id: 'request', type: 'choice', instructions: 'What does the sender request?', options: { information: 'An explanation.', intervention: 'An action.' } },
  ] }, { feature: 'synthetic_block_judgments', provider });
  expect(result).toEqual({ answers: { failure: { type: 'noul', noul: 0.8 } }, model: 'decision-model', llmCallId: null });
  expect(received?.questions).toMatchObject({
    failure: { type: 'noul', instructions: 'Does the sender report a failed delivery?' },
    dissatisfaction: { type: 'score', criteria: ['None.', 'Some.', 'Strong.'] },
    request: { type: 'choice', criteria: { information: 'An explanation.', intervention: 'An action.' } },
  });
});

it('rejects duplicate question ids before calling the model', async () => {
  let calls = 0;
  const provider: DecisionProvider = { provider: 'gateway', model: 'decision-model', decide: async () => { calls++; throw new Error('unreachable'); } };
  await expect(askJudgments({ state: {}, questions: [
    { id: 'same', type: 'noul', instructions: 'First?' }, { id: 'same', type: 'noul', instructions: 'Second?' },
  ] }, { feature: 'synthetic_block_judgments', provider })).rejects.toThrow('unique');
  expect(calls).toBe(0);
});
