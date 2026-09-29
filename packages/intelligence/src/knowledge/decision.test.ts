import { describe, it, expect } from 'bun:test';

import {
  buildKnowledgeQuestions,
  parseKnowledgeAnswers,
  shouldDraftKnowledge,
  KNOWLEDGE_TYPES,
  EVIDENCE_QUALITIES,
  type KnowledgeDecision,
} from './decision';

function answer(choiceValue: string, confidence: number) {
  return { type: 'choice' as const, choice: choiceValue, confidence };
}

describe('buildKnowledgeQuestions', () => {
  it('asks four choice questions and offers every canonical value, and no others', () => {
    const questions = buildKnowledgeQuestions();
    expect(Object.keys(questions).sort()).toEqual(['evidence', 'is_candidate', 'knowledge_type', 'reusable']);
    for (const q of Object.values(questions)) expect(q.type).toBe('choice');
    expect(Object.keys(questions['knowledge_type']!.criteria!)).toEqual([...KNOWLEDGE_TYPES]);
    expect(Object.keys(questions['evidence']!.criteria!)).toEqual([...EVIDENCE_QUALITIES]);
    expect(Object.keys(questions['is_candidate']!.criteria!)).toEqual(['yes', 'no']);
  });
});

describe('parseKnowledgeAnswers', () => {
  it('maps yes/no choices onto booleans and keeps the typed values', () => {
    const decision = parseKnowledgeAnswers({
      is_candidate: answer('yes', 0.95),
      knowledge_type: answer('resolution', 0.9),
      reusable: answer('no', 0.85),
      evidence: answer('high', 0.92),
    });
    expect(decision).toEqual({
      isKnowledgeCandidate: true,
      knowledgeType: 'resolution',
      reusableAcrossCustomers: false,
      evidenceQuality: 'high',
      confidence: 0.85,
    });
  });

  it('rejects a value outside the canonical vocabulary instead of writing it downstream', () => {
    expect(() =>
      parseKnowledgeAnswers({
        is_candidate: answer('yes', 0.9),
        knowledge_type: answer('guess', 0.9),
        reusable: answer('yes', 0.9),
        evidence: answer('high', 0.9),
      }),
    ).toThrow();
  });
});

describe('shouldDraftKnowledge', () => {
  const base: KnowledgeDecision = {
    isKnowledgeCandidate: true,
    knowledgeType: 'resolution',
    reusableAcrossCustomers: true,
    evidenceQuality: 'high',
    confidence: 0.9,
  };

  it('drafts a confident candidate', () => {
    expect(shouldDraftKnowledge(base)).toBe(true);
  });

  it('does not draft when JEV says it is not a candidate', () => {
    expect(shouldDraftKnowledge({ ...base, isKnowledgeCandidate: false })).toBe(false);
  });

  it('does not draft a candidate whose type is none', () => {
    expect(shouldDraftKnowledge({ ...base, knowledgeType: 'none' })).toBe(false);
  });

  it('does not draft below the confidence threshold, and honours a custom one', () => {
    expect(shouldDraftKnowledge({ ...base, confidence: 0.5 })).toBe(false);
    expect(shouldDraftKnowledge({ ...base, confidence: 0.5 }, 0.4)).toBe(true);
  });
});
