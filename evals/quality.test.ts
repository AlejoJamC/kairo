import { expect, test } from 'bun:test';
import { classificationQuality, proposalQuality, ticketClusters } from './quality';
import type { Measurement } from './metrics';

function row(id: number, truth: string, prediction: string, status: Measurement['status'] = 'completed'): Measurement {
  return { case: { id, dataset: 'synthetic', contract: 'historical_learning', lang: 'en', subject: 'Invented request',
    body: 'An invented request.', expected: { priority: truth }, rubric: [] },
    prediction: { priority: prediction }, status, abstain: null, latencyMs: 1, requests: [], calls: [], output: {}, safety: {} };
}

test('completed execution can miss each quality threshold without rewriting its status', () => {
  const measurements = [row(1, 'P1', 'P2'), row(2, 'P2', 'P2'), row(3, 'P2', 'P2')];
  const before = structuredClone(measurements);
  const result = classificationQuality(measurements);
  expect(result['priority']).toMatchObject({ score: 0.4, count: 3, calibratedModelConfidence: null,
    comparisons: [0.7, 0.8, 0.9].map(threshold => ({ threshold, meetsThreshold: false })) });
  expect(result['tone']).toMatchObject({ score: null, confidenceInterval: null,
    comparisons: [0.7, 0.8, 0.9].map(threshold => ({ threshold, meetsThreshold: null })) });
  expect(measurements).toEqual(before);
});

test('threshold comparison includes equality and counts failed executions as errors', () => {
  const result = classificationQuality([row(1, 'P1', 'P1'), row(2, 'P1', 'P1')]);
  expect(result['priority']).toMatchObject({ score: 1, comparisons: [0.7, 0.8, 0.9].map(threshold => ({ threshold, meetsThreshold: true })) });
  expect(classificationQuality([row(1, 'P1', 'P1', 'failed')])['priority']).toMatchObject({ score: 0 });
});

test('uncertainty resamples tickets together and does not claim calibration or single-ticket reliability', () => {
  const measurements = [row(1, 'P1', 'P1'), row(2, 'P1', 'P2'), row(3, 'P2', 'P2')];
  const grouped = classificationQuality(measurements, { 1: 'ticket-a', 2: 'ticket-a', 3: 'ticket-b' });
  expect(grouped).toEqual(classificationQuality(measurements, { 1: 'ticket-a', 2: 'ticket-a', 3: 'ticket-b' }));
  expect(grouped['priority']).toMatchObject({ count: 3, clusters: 2, confidenceInterval: { level: 0.95, resamples: 2000 } });
  expect(classificationQuality(measurements, { 1: 'ticket-a', 2: 'ticket-a', 3: 'ticket-a' })['priority']).toMatchObject({ confidenceInterval: null });
});

test('ticket grouping uses saved linkage and reports proposal validation independently from persistence', () => {
  expect(ticketClusters({ messages: [{ id: 'message-a', external_id: 'acme-message-1' }, { id: 'message-b', external_id: 'acme-message-2' }],
    ticket_messages: [{ message_id: 'message-a', ticket_id: 'ticket-a' }, { message_id: 'message-b', ticket_id: 'ticket-a' }] })).toEqual({ 1: 'ticket-a', 2: 'ticket-a' });
  const result = proposalQuality([{ step: 'knowledge_proposals', output: { proposals: [
    { status: 'blocked', reasons: ['invalid_source_reference'] },
    { status: 'blocked', reasons: ['already_known'] },
    { status: 'pending_review', validation: { value: { support: { choice: 'supported' } } } },
    { status: 'pending_review', validation: { value: { support: { choice: 'unsupported' } } } },
  ] } }]);
  expect(result).toEqual({ drafted: 4, invalidSource: 1, redundant: 1, pendingReview: 2, supported: 1, unsupported: 1, uncertain: 0 });
});
