import { describe, it, expect } from 'bun:test';
import { extractCandidatesHeuristic } from '../candidates.js';
import type { TicketCorpus } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCorpus(overrides?: Partial<TicketCorpus>): TicketCorpus {
  return {
    ticket: {
      id: 'ticket-1',
      account_id: 'account-1',
      subject: 'Test ticket',
      from_email: null,
      from_name: null,
      to_email: null,
      body_plain: null,
      body_html: null,
      ...overrides?.ticket,
    },
    messages: overrides?.messages ?? [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('extractCandidatesHeuristic', () => {
  it('parses a sender with display name and email — spec fixture', () => {
    const corpus = makeCorpus({
      messages: [
        {
          id: 'msg-1',
          sender_external_id: '"Johan Hurtua" <s@disfarma.com.co>',
          sender_display_name: 'Johan Hurtua',
          body_plain: null,
          raw_payload: null,
        },
      ],
    });

    const candidates = extractCandidatesHeuristic(corpus);
    expect(candidates).toHaveLength(1);
    const c = candidates[0]!;
    expect(c.email).toBe('s@disfarma.com.co');
    expect(c.display_name).toBe('Johan Hurtua');
    expect(c.organization).toBe('Disfarma');
    expect(c.evidence_role).toBe('sender');
    expect(c.source).toBe('from_header');
    expect(c.phone).toBeNull();
  });

  it('extracts cc candidates from raw_payload headers', () => {
    const corpus = makeCorpus({
      messages: [
        {
          id: 'msg-1',
          sender_external_id: 'main@example.com',
          sender_display_name: null,
          body_plain: null,
          raw_payload: {
            headers: {
              Cc: 'cc-person@corp.com',
              To: 'to-person@example.com',
            },
          },
        },
      ],
    });

    const candidates = extractCandidatesHeuristic(corpus);
    const emails = candidates.map((c) => c.email);
    expect(emails).toContain('main@example.com');
    expect(emails).toContain('cc-person@corp.com');
    expect(emails).toContain('to-person@example.com');
  });

  it('deduplicates: sender wins over cc for same email', () => {
    const corpus = makeCorpus({
      messages: [
        {
          id: 'msg-1',
          sender_external_id: 'person@corp.com',
          sender_display_name: 'Corp Person',
          body_plain: null,
          raw_payload: {
            headers: {
              Cc: 'person@corp.com',
            },
          },
        },
      ],
    });

    const candidates = extractCandidatesHeuristic(corpus);
    const corpPersonCandidates = candidates.filter((c) => c.email === 'person@corp.com');
    expect(corpPersonCandidates).toHaveLength(1);
    expect(corpPersonCandidates[0]!.evidence_role).toBe('sender');
  });

  it('seeds from ticket.from_email when messages are empty', () => {
    const corpus = makeCorpus({
      ticket: {
        id: 'ticket-1',
        account_id: 'account-1',
        subject: 'Test',
        from_email: 'contact@somecorp.com',
        from_name: 'Some Contact',
        to_email: null,
        body_plain: null,
        body_html: null,
      },
      messages: [],
    });

    const candidates = extractCandidatesHeuristic(corpus);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.email).toBe('contact@somecorp.com');
    expect(candidates[0]!.display_name).toBe('Some Contact');
    expect(candidates[0]!.organization).toBe('Somecorp');
  });

  it('parses array-shaped raw_payload headers (Gmail format)', () => {
    const corpus = makeCorpus({
      messages: [
        {
          id: 'msg-1',
          sender_external_id: 'from@example.com',
          sender_display_name: null,
          body_plain: null,
          raw_payload: {
            headers: [
              { name: 'To', value: 'to@example.com' },
              { name: 'Cc', value: 'cc@corp.com' },
            ],
          },
        },
      ],
    });

    const candidates = extractCandidatesHeuristic(corpus);
    const emails = candidates.map((c) => c.email);
    expect(emails).toContain('to@example.com');
    expect(emails).toContain('cc@corp.com');
  });

  it('phone is always null in Pasada A', () => {
    const corpus = makeCorpus({
      messages: [
        {
          id: 'msg-1',
          sender_external_id: 'person@corp.com',
          sender_display_name: null,
          body_plain: null,
          raw_payload: null,
        },
      ],
    });
    const candidates = extractCandidatesHeuristic(corpus);
    for (const c of candidates) {
      expect(c.phone).toBeNull();
    }
  });

  it('returns empty for corpus with no messages and no ticket from_email', () => {
    const corpus = makeCorpus();
    const candidates = extractCandidatesHeuristic(corpus);
    expect(candidates).toHaveLength(0);
  });
});
