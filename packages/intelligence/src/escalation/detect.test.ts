import { describe, it, expect } from 'bun:test';
import { detectEscalationTriggers } from './detect.js';
import type { EscalationContext } from './types.js';

// ---------------------------------------------------------------------------
// KAI-41 acceptance criteria
// AC #1 — All 5 trigger types detectable
// AC #2 — recommendedLevel derived from trigger severity
// AC #3 — Reasons include label_es + label_en + severity
// ---------------------------------------------------------------------------

const now = new Date().toISOString();
const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60 * 1000).toISOString();

const base: EscalationContext = {
  ticketId:           'uuid-1',
  emotion:            'neutral',
  slaBreached:        false,
  slaDueAt:           null,
  createdAt:          now,
  status:             'open',
  planScore:          0,
  ticketsLast30Days:  0,
  technicalLast7Days: 0,
  pastL2CaseFound:    false,
};

describe('sla_breach_risk', () => {
  it('triggers when SLA due in < 60 min and ticket open', () => {
    const result = detectEscalationTriggers({ ...base, slaDueAt: minutesFromNow(30), status: 'open' });
    expect(result.reasons.some((r) => r.id === 'sla_breach_risk')).toBe(true);
  });

  it('does not trigger when SLA due in > 60 min', () => {
    const result = detectEscalationTriggers({ ...base, slaDueAt: minutesFromNow(90) });
    expect(result.reasons.some((r) => r.id === 'sla_breach_risk')).toBe(false);
  });

  it('does not trigger when ticket is resolved', () => {
    const result = detectEscalationTriggers({ ...base, slaDueAt: minutesFromNow(10), status: 'resolved' });
    expect(result.reasons.some((r) => r.id === 'sla_breach_risk')).toBe(false);
  });
});

describe('enterprise_client', () => {
  it('triggers when planScore >= 0.8 and open > 2 hours', () => {
    const result = detectEscalationTriggers({ ...base, planScore: 1.0, createdAt: hoursAgo(3) });
    expect(result.reasons.some((r) => r.id === 'enterprise_client')).toBe(true);
  });

  it('does not trigger when planScore < 0.8', () => {
    const result = detectEscalationTriggers({ ...base, planScore: 0.67, createdAt: hoursAgo(3) });
    expect(result.reasons.some((r) => r.id === 'enterprise_client')).toBe(false);
  });

  it('does not trigger when open < 2 hours', () => {
    const result = detectEscalationTriggers({ ...base, planScore: 1.0, createdAt: hoursAgo(1) });
    expect(result.reasons.some((r) => r.id === 'enterprise_client')).toBe(false);
  });
});

describe('high_frustration', () => {
  it('triggers when emotion frustrated and 3+ tickets in 30 days', () => {
    const result = detectEscalationTriggers({ ...base, emotion: 'frustrated', ticketsLast30Days: 3 });
    expect(result.reasons.some((r) => r.id === 'high_frustration')).toBe(true);
  });

  it('does not trigger when frustrated but only 2 tickets', () => {
    const result = detectEscalationTriggers({ ...base, emotion: 'frustrated', ticketsLast30Days: 2 });
    expect(result.reasons.some((r) => r.id === 'high_frustration')).toBe(false);
  });

  it('does not trigger when neutral emotion even with many tickets', () => {
    const result = detectEscalationTriggers({ ...base, emotion: 'neutral', ticketsLast30Days: 10 });
    expect(result.reasons.some((r) => r.id === 'high_frustration')).toBe(false);
  });
});

describe('repeated_error', () => {
  it('triggers when 2+ technical tickets in last 7 days', () => {
    const result = detectEscalationTriggers({ ...base, technicalLast7Days: 2 });
    expect(result.reasons.some((r) => r.id === 'repeated_error')).toBe(true);
  });

  it('does not trigger with only 1 technical ticket', () => {
    const result = detectEscalationTriggers({ ...base, technicalLast7Days: 1 });
    expect(result.reasons.some((r) => r.id === 'repeated_error')).toBe(false);
  });
});

describe('past_l2_case', () => {
  it('triggers when pastL2CaseFound is true', () => {
    const result = detectEscalationTriggers({ ...base, pastL2CaseFound: true });
    expect(result.reasons.some((r) => r.id === 'past_l2_case')).toBe(true);
  });

  it('does not trigger when false', () => {
    const result = detectEscalationTriggers({ ...base, pastL2CaseFound: false });
    expect(result.reasons.some((r) => r.id === 'past_l2_case')).toBe(false);
  });
});

describe('recommendedLevel', () => {
  it('level 1 when no triggers', () => {
    expect(detectEscalationTriggers(base).recommendedLevel).toBe(1);
  });

  it('level 2 with one high trigger', () => {
    const result = detectEscalationTriggers({ ...base, pastL2CaseFound: true });
    expect(result.recommendedLevel).toBe(2);
  });

  it('level 3 with two high triggers', () => {
    const result = detectEscalationTriggers({
      ...base,
      pastL2CaseFound: true,
      slaDueAt: minutesFromNow(20),
    });
    expect(result.recommendedLevel).toBe(3);
  });
});

describe('reason shape', () => {
  it('every reason has id, label_es, label_en, severity', () => {
    const result = detectEscalationTriggers({ ...base, pastL2CaseFound: true, technicalLast7Days: 3 });
    for (const r of result.reasons) {
      expect(r).toHaveProperty('id');
      expect(r).toHaveProperty('label_es');
      expect(r).toHaveProperty('label_en');
      expect(r).toHaveProperty('severity');
    }
  });
});
