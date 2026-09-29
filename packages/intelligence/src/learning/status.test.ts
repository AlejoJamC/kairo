import { describe, it, expect } from 'bun:test';

import { initialLearningStatus } from './status';

describe('initialLearningStatus', () => {
  it('a human correction is its own approval — no review step', () => {
    expect(initialLearningStatus('human_correction')).toBe('approved');
  });

  it('a system-derived candidate starts pending review — nobody vouched for it yet', () => {
    expect(initialLearningStatus('system_derived')).toBe('pending_review');
  });
});
