import { describe, it, expect } from 'bun:test';

import { ACTIONABILITY_VALUES, CATEGORY, PRIORITY, SUBJECT_MATTER_VALUES, TONE, URGENCY } from '../../classification/schema';
import { buildTicketVerdictQuestions, NO_REASONING, parseTicketVerdictAnswers } from './ticket-verdict';

describe('buildTicketVerdictQuestions', () => {
  it('asks exactly the six ModelVerdictSchema axes, each a choice question', () => {
    const questions = buildTicketVerdictQuestions();
    expect(Object.keys(questions).sort()).toEqual(
      ['actionability', 'category', 'priority', 'subject_matter', 'tone', 'urgency'].sort(),
    );
    for (const q of Object.values(questions)) {
      expect(q.type).toBe('choice');
    }
  });

  it('offers every canonical value as a criterion, and no others', () => {
    const questions = buildTicketVerdictQuestions();
    expect(Object.keys(questions['actionability']!.criteria!)).toEqual([...ACTIONABILITY_VALUES]);
    expect(Object.keys(questions['subject_matter']!.criteria!)).toEqual([...SUBJECT_MATTER_VALUES]);
    expect(Object.keys(questions['priority']!.criteria!)).toEqual([...PRIORITY]);
    expect(Object.keys(questions['category']!.criteria!)).toEqual([...CATEGORY]);
    expect(Object.keys(questions['tone']!.criteria!)).toEqual([...TONE]);
    expect(Object.keys(questions['urgency']!.criteria!)).toEqual([...URGENCY]);
  });
});

function answer(choiceValue: string, confidence: number) {
  return { type: 'choice' as const, choice: choiceValue, confidence };
}

describe('parseTicketVerdictAnswers', () => {
  it('maps each answer onto the matching ModelVerdictResult field', () => {
    const verdict = parseTicketVerdictAnswers({
      actionability: answer('needs_action', 0.9),
      subject_matter: answer('service', 0.9),
      priority: answer('P1', 0.9),
      category: answer('technical', 0.9),
      tone: answer('neutral', 0.9),
      urgency: answer('high', 0.9),
    });

    expect(verdict).toMatchObject({
      actionability: 'needs_action',
      subject_matter: 'service',
      priority: 'P1',
      category: 'technical',
      tone: 'neutral',
      urgency: 'high',
    });
  });

  it('never fabricates a reasoning string — JEV has no text primitive', () => {
    const verdict = parseTicketVerdictAnswers({
      actionability: answer('fyi', 0.9),
      subject_matter: answer('admin', 0.9),
      priority: answer('P3', 0.9),
      category: answer('general', 0.9),
      tone: answer('neutral', 0.9),
      urgency: answer('low', 0.9),
    });
    expect(verdict.reasoning).toBe(NO_REASONING);
  });

  it('the verdict confidence is the minimum across the six answers, not an average', () => {
    const verdict = parseTicketVerdictAnswers({
      actionability: answer('needs_action', 0.99),
      subject_matter: answer('service', 0.95),
      priority: answer('P1', 0.4),
      category: answer('technical', 0.97),
      tone: answer('neutral', 0.92),
      urgency: answer('high', 0.9),
    });
    expect(verdict.confidence).toBe(0.4);
  });

  it('fails loudly on a mapping bug instead of writing an invalid enum downstream', () => {
    expect(() =>
      parseTicketVerdictAnswers({
        actionability: answer('needs_action', 0.9),
        subject_matter: answer('service', 0.9),
        priority: answer('P1', 0.9),
        category: answer('not-a-real-category', 0.9),
        tone: answer('neutral', 0.9),
        urgency: answer('high', 0.9),
      }),
    ).toThrow();
  });
});
