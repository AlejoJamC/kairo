import { describe, it, expect } from 'bun:test';

import { authorizeTicketTypeAction } from './authorize';

describe('authorizeTicketTypeAction', () => {
  it('abstain always wins, even with everything else earned', () => {
    const result = authorizeTicketTypeAction({
      abstain: true,
      autoApprovalEnabled: true,
      hasBusinessContext: true,
      calibratedConfidence: 0.99,
    });
    expect(result).toEqual({ allowed: false, mode: 'human_required', reason: 'abstain' });
  });

  it('missing business context requires a human, when abstain is false', () => {
    const result = authorizeTicketTypeAction({
      abstain: false,
      hasBusinessContext: false,
      autoApprovalEnabled: true,
    });
    expect(result).toEqual({ allowed: false, mode: 'human_required', reason: 'no_business_context' });
  });

  it('an unearned class is a suggestion, not a block', () => {
    const result = authorizeTicketTypeAction({
      abstain: false,
      hasBusinessContext: true,
      autoApprovalEnabled: false,
    });
    expect(result).toEqual({ allowed: false, mode: 'suggestion', reason: 'auto_approval_not_earned' });
  });

  it('an earned class with no calibrated confidence passed goes automatic — the Anthropic/Ollama path is unaffected', () => {
    const result = authorizeTicketTypeAction({
      abstain: false,
      hasBusinessContext: true,
      autoApprovalEnabled: true,
    });
    expect(result).toEqual({ allowed: true, mode: 'automatic', reason: 'auto_approval_earned' });
  });

  it('tier1 omits hasBusinessContext entirely and is not gated by it', () => {
    const result = authorizeTicketTypeAction({
      abstain: false,
      autoApprovalEnabled: true,
    });
    expect(result.mode).toBe('automatic');
  });

  it('an earned class with confidence at or above the default threshold goes automatic', () => {
    const atThreshold = authorizeTicketTypeAction({
      abstain: false,
      hasBusinessContext: true,
      autoApprovalEnabled: true,
      calibratedConfidence: 0.7,
    });
    expect(atThreshold.mode).toBe('automatic');

    const aboveThreshold = authorizeTicketTypeAction({
      abstain: false,
      hasBusinessContext: true,
      autoApprovalEnabled: true,
      calibratedConfidence: 0.95,
    });
    expect(aboveThreshold.mode).toBe('automatic');
  });

  it('an earned class with confidence below the default threshold downgrades to suggestion, not a block', () => {
    const result = authorizeTicketTypeAction({
      abstain: false,
      hasBusinessContext: true,
      autoApprovalEnabled: true,
      calibratedConfidence: 0.69,
    });
    expect(result).toEqual({ allowed: false, mode: 'suggestion', reason: 'low_calibrated_confidence' });
  });

  it('a custom confidenceThreshold overrides the default', () => {
    const result = authorizeTicketTypeAction({
      abstain: false,
      hasBusinessContext: true,
      autoApprovalEnabled: true,
      calibratedConfidence: 0.5,
      confidenceThreshold: 0.4,
    });
    expect(result.mode).toBe('automatic');
  });

  it('the account permission is necessary even at perfect confidence — a confident call cannot buy a class the account has not earned', () => {
    const result = authorizeTicketTypeAction({
      abstain: false,
      hasBusinessContext: true,
      autoApprovalEnabled: false,
      calibratedConfidence: 1,
    });
    expect(result).toEqual({ allowed: false, mode: 'suggestion', reason: 'auto_approval_not_earned' });
  });
});
