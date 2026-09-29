import { describe, it, expect } from 'bun:test';

import {
  computeTrustStatsByType,
  resolveAutoApprovalEnabled,
  TRUST_REVIEW_WINDOW,
  type ClassificationReviewRow,
} from './trust';

function confirm(ticketType: string): ClassificationReviewRow {
  return { actorRef: 'tickets.classify-approve', toValue: ticketType, fromValue: null, applied: true };
}
function reject(ticketType: string): ClassificationReviewRow {
  return { actorRef: 'tickets.classify-approve', toValue: ticketType, fromValue: null, applied: false };
}
function correct(fromType: string, toType: string): ClassificationReviewRow {
  return { actorRef: 'tickets.correct-classification', toValue: toType, fromValue: fromType, applied: true };
}

describe('computeTrustStatsByType', () => {
  it('has no stats at all with no evidence', () => {
    expect(computeTrustStatsByType([])).toEqual([]);
  });

  it('a confirm is evidence the AI was right, keyed by the confirmed type', () => {
    const [stats] = computeTrustStatsByType([confirm('support'), confirm('support'), confirm('support')]);
    expect(stats).toEqual({ ticketType: 'support', precision: 1, sampleCount: 3 });
  });

  it('a reject is evidence the AI was wrong, keyed by the rejected type — not the correction destination', () => {
    const [stats] = computeTrustStatsByType([reject('support')]);
    expect(stats).toEqual({ ticketType: 'support', precision: 0, sampleCount: 1 });
  });

  it('a correction counts against the type the AI claimed, never for the type it was corrected to', () => {
    const stats = computeTrustStatsByType([correct('support', 'spam')]);
    expect(stats).toEqual([{ ticketType: 'support', precision: 0, sampleCount: 1 }]);
    // 'spam' gets nothing from this row — being corrected TO it says nothing about whether IT is right.
  });

  it('mixed evidence produces the right precision per type', () => {
    const rows = [confirm('support'), confirm('support'), reject('support'), correct('support', 'internal')];
    const [stats] = computeTrustStatsByType(rows);
    expect(stats.sampleCount).toBe(4);
    expect(stats.precision).toBe(0.5); // 2 confirmed / 4 total
  });

  it('tracks multiple types independently', () => {
    const rows = [confirm('support'), confirm('support'), reject('spam')];
    const stats = computeTrustStatsByType(rows);
    const byType = new Map(stats.map((s) => [s.ticketType, s]));
    expect(byType.get('support')).toEqual({ ticketType: 'support', precision: 1, sampleCount: 2 });
    expect(byType.get('spam')).toEqual({ ticketType: 'spam', precision: 0, sampleCount: 1 });
  });

  it('caps each type at the last TRUST_REVIEW_WINDOW pieces of evidence — older activity does not water down a recent run', () => {
    const oldBad = Array.from({ length: 20 }, () => reject('support'));
    const recentGood = Array.from({ length: TRUST_REVIEW_WINDOW }, () => confirm('support'));
    // Most-recent-first: the good run comes first, the old bad run is older and falls outside the window.
    const [stats] = computeTrustStatsByType([...recentGood, ...oldBad]);
    expect(stats.sampleCount).toBe(TRUST_REVIEW_WINDOW);
    expect(stats.precision).toBe(1);
  });

  it('ignores a row with no actor_ref it recognizes', () => {
    expect(computeTrustStatsByType([{ actorRef: 'tickets.classify', toValue: 'support', fromValue: null, applied: true }])).toEqual([]);
  });
});

describe('resolveAutoApprovalEnabled', () => {
  it('is false with no evidence — never earned by default', () => {
    expect(resolveAutoApprovalEnabled({ precision: null, sampleCount: 0 }, 0.9, 30)).toBe(false);
  });

  it('is false below the minimum sample size, even at perfect precision', () => {
    expect(resolveAutoApprovalEnabled({ precision: 1, sampleCount: 10 }, 0.9, 30)).toBe(false);
  });

  it('is false below the minimum precision, even with enough samples', () => {
    expect(resolveAutoApprovalEnabled({ precision: 0.8, sampleCount: 50 }, 0.9, 30)).toBe(false);
  });

  it('is true once both thresholds are met', () => {
    expect(resolveAutoApprovalEnabled({ precision: 0.95, sampleCount: 30 }, 0.9, 30)).toBe(true);
  });
});
