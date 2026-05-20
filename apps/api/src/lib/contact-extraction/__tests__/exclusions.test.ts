import { describe, it, expect } from 'bun:test';
import { filterCandidates } from '../exclusions.js';
import type { Candidate } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCandidate(overrides: Partial<Candidate> & { email: string }): Candidate {
  return {
    phone: null,
    display_name: null,
    organization: null,
    source: 'from_header',
    evidence_role: 'sender',
    ...overrides,
  };
}

const emptyCtx = { tenantInternalEmails: new Set<string>() };

// ---------------------------------------------------------------------------
// Rule 1: Bot / noreply pattern
// ---------------------------------------------------------------------------

describe('filterCandidates — Rule 1: bot/noreply patterns', () => {
  it('excludes no-reply@... emails', () => {
    const candidates = [makeCandidate({ email: 'no-reply@example.com' })];
    expect(filterCandidates(candidates, emptyCtx)).toHaveLength(0);
  });

  it('excludes noreply@... emails', () => {
    const candidates = [makeCandidate({ email: 'noreply@store.com' })];
    expect(filterCandidates(candidates, emptyCtx)).toHaveLength(0);
  });

  it('excludes bounces@... emails', () => {
    const candidates = [makeCandidate({ email: 'bounces@mail.example.com' })];
    expect(filterCandidates(candidates, emptyCtx)).toHaveLength(0);
  });

  it('excludes postmaster@... emails', () => {
    const candidates = [makeCandidate({ email: 'postmaster@example.com' })];
    expect(filterCandidates(candidates, emptyCtx)).toHaveLength(0);
  });

  it('excludes mailer-daemon@... emails', () => {
    const candidates = [makeCandidate({ email: 'mailer-daemon@example.com' })];
    expect(filterCandidates(candidates, emptyCtx)).toHaveLength(0);
  });

  it('excludes emails with noreply in local-part', () => {
    const candidates = [makeCandidate({ email: 'orders+noreply@store.com' })];
    expect(filterCandidates(candidates, emptyCtx)).toHaveLength(0);
  });

  it('keeps legitimate email addresses', () => {
    const candidates = [makeCandidate({ email: 'support@company.com' })];
    expect(filterCandidates(candidates, emptyCtx)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Rule 2: Tenant internal emails
// ---------------------------------------------------------------------------

describe('filterCandidates — Rule 2: tenant internal emails', () => {
  it('excludes tenant email in from header', () => {
    const tenantEmail = 'support@mycompany.com';
    const ctx = { tenantInternalEmails: new Set([tenantEmail]) };
    const candidates = [
      makeCandidate({ email: tenantEmail, evidence_role: 'sender' }),
    ];
    expect(filterCandidates(candidates, ctx)).toHaveLength(0);
  });

  it('keeps non-tenant emails when tenant set is populated', () => {
    const ctx = { tenantInternalEmails: new Set(['support@mycompany.com']) };
    const candidates = [
      makeCandidate({ email: 'external@customer.com' }),
    ];
    expect(filterCandidates(candidates, ctx)).toHaveLength(1);
  });

  it('excludes tenant email regardless of case stored in set', () => {
    // filterCandidates expects emails already normalized (lowercase)
    const ctx = { tenantInternalEmails: new Set(['support@mycompany.com']) };
    const candidates = [makeCandidate({ email: 'support@mycompany.com' })];
    expect(filterCandidates(candidates, ctx)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Rule 3: Mass CC exclusion
// ---------------------------------------------------------------------------

describe('filterCandidates — Rule 3: mass CC exclusion', () => {
  it('excludes cc-only email with >10 co-recipients', () => {
    const email = 'cc-user@company.com';
    const candidates = [
      makeCandidate({ email, evidence_role: 'cc', source: 'cc_header' }),
    ];
    // Simulate 12 CC recipients for this email
    const ccCountByEmail = new Map([[email, 12]]);
    expect(filterCandidates(candidates, emptyCtx, ccCountByEmail)).toHaveLength(0);
  });

  it('keeps cc email with ≤10 co-recipients', () => {
    const email = 'cc-user@company.com';
    const candidates = [
      makeCandidate({ email, evidence_role: 'cc', source: 'cc_header' }),
    ];
    const ccCountByEmail = new Map([[email, 5]]);
    expect(filterCandidates(candidates, emptyCtx, ccCountByEmail)).toHaveLength(1);
  });

  it('keeps sender email even if it appears in a large CC line', () => {
    const email = 'real-sender@company.com';
    const candidates = [
      makeCandidate({ email, evidence_role: 'sender', source: 'from_header' }),
    ];
    // Even with high CC count, sender role is kept
    const ccCountByEmail = new Map([[email, 50]]);
    expect(filterCandidates(candidates, emptyCtx, ccCountByEmail)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Combined
// ---------------------------------------------------------------------------

describe('filterCandidates — combined rules', () => {
  it('filters multiple rules simultaneously', () => {
    const tenantEmail = 'agent@company.com';
    const ctx = { tenantInternalEmails: new Set([tenantEmail]) };
    const candidates = [
      makeCandidate({ email: 'customer@external.com' }),           // kept
      makeCandidate({ email: tenantEmail }),                        // Rule 2 excluded
      makeCandidate({ email: 'no-reply@notifications.com' }),      // Rule 1 excluded
    ];
    const result = filterCandidates(candidates, ctx);
    expect(result).toHaveLength(1);
    expect(result[0]!.email).toBe('customer@external.com');
  });
});
