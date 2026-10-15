import { expect, test } from 'bun:test';
import { choiceAnswerSchema } from './choice-answer-schema';

const schema = choiceAnswerSchema({ high: '', medium: '', low: '' });
const answer = (probabilities: Record<string, number>, choice = 'high') => ({
  type: 'choice', choice, confidence: 0.5, probabilities,
});

test('accepts rounded distributions at either tolerance boundary without modifying them', () => {
  for (const probabilities of [{ high: 0.5, medium: 0.3, low: 0.21 }, { high: 0.5, medium: 0.3, low: 0.19 }]) {
    expect(schema.parse(answer(probabilities)).probabilities).toEqual(probabilities);
  }
});

test('still rejects incomplete, non-normalized and contradictory distributions', () => {
  for (const value of [
    answer({ high: 0.5, medium: 0.3 }),
    answer({ high: 0.5, medium: 0.3, low: 0.3 }),
    answer({ high: 0.5, medium: 0.3, low: 0.2 }, 'low'),
    answer({ high: 1.1, medium: 0, low: -0.1 }),
    answer({ high: 0, medium: 0, low: 0 }),
  ]) expect(schema.safeParse(value).success).toBe(false);
});
