import { describe, it, expect, beforeEach } from 'bun:test';
import { upsertDraftContact } from '../upsert.js';
import type { Candidate } from '../types.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Mock draft_contact store
// ---------------------------------------------------------------------------

type DraftRow = {
  id: string;
  account_id: string;
  email: string | null;
  phone: string | null;
  display_name: string | null;
  organization: string | null;
  status: string;
  origin: string;
  evidence_count: number;
  source_tickets: string[];
  first_seen_at: string;
  last_seen_at: string;
  confidence: number;
  merged_into_id: string | null;
  metadata: Record<string, unknown>;
};

let store: Map<string, DraftRow>;
let idCounter: number;

beforeEach(() => {
  store = new Map();
  idCounter = 0;
});

function makeMockClient(): // eslint-disable-next-line @typescript-eslint/no-explicit-any
SupabaseClient<any> {
  const self = {
    from(table: string) {
      if (table !== 'draft_contact') {
        throw new Error(`Unexpected table in mock: ${table}`);
      }
      return {
        select() {
          return {
            eq(col: string, val: string) {
              return {
                eq(col2: string, val2: string) {
                  return {
                    limit() {
                      return {
                        maybeSingle() {
                          // Find by account_id + email or phone
                          const found = Array.from(store.values()).find((r) => {
                            if (col === 'account_id' && col2 === 'email') {
                              return r.account_id === val && r.email === val2;
                            }
                            if (col === 'account_id' && col2 === 'phone') {
                              return r.account_id === val && r.phone === val2;
                            }
                            return false;
                          });
                          return Promise.resolve({ data: found ?? null, error: null });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        insert(data: Partial<DraftRow>) {
          return {
            select() {
              return {
                maybeSingle() {
                  // Check for conflict
                  const emailConflict = data.email
                    ? Array.from(store.values()).find(
                        (r) => r.account_id === data.account_id && r.email === data.email,
                      )
                    : null;
                  const phoneConflict = !emailConflict && data.phone
                    ? Array.from(store.values()).find(
                        (r) => r.account_id === data.account_id && r.phone === data.phone,
                      )
                    : null;

                  if (emailConflict || phoneConflict) {
                    // ON CONFLICT DO NOTHING — return null
                    return Promise.resolve({ data: null, error: null });
                  }

                  const id = `draft-${++idCounter}`;
                  const row: DraftRow = {
                    id,
                    account_id: data.account_id ?? '',
                    email: data.email ?? null,
                    phone: data.phone ?? null,
                    display_name: data.display_name ?? null,
                    organization: data.organization ?? null,
                    status: data.status ?? 'proposed',
                    origin: data.origin ?? 'kairo_created',
                    evidence_count: data.evidence_count ?? 1,
                    source_tickets: data.source_tickets ?? [],
                    first_seen_at: data.first_seen_at ?? new Date().toISOString(),
                    last_seen_at: data.last_seen_at ?? new Date().toISOString(),
                    confidence: data.confidence ?? 0.3,
                    merged_into_id: null,
                    metadata: data.metadata ?? {},
                  };
                  store.set(id, row);
                  return Promise.resolve({ data: { id }, error: null });
                },
              };
            },
          };
        },
        update(updates: Partial<DraftRow>) {
          return {
            eq(_col: string, id: string) {
              const existing = store.get(id);
              if (existing) {
                store.set(id, { ...existing, ...updates });
              }
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  } as unknown as // eslint-disable-next-line @typescript-eslint/no-explicit-any
SupabaseClient<any>;
  return self;
}

// ---------------------------------------------------------------------------
// Candidates
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('upsertDraftContact — idempotency', () => {
  it('two calls with same (accountId, ticketId, email) → 1 INSERT + 1 no-op, evidence_count stays 1', async () => {
    const client = makeMockClient();
    const candidate = makeCandidate({ email: 's@disfarma.com.co', display_name: 'Johan' });

    const r1 = await upsertDraftContact(client, 'account-1', 'ticket-1', candidate);
    expect(r1.wasCreated).toBe(true);

    const r2 = await upsertDraftContact(client, 'account-1', 'ticket-1', candidate);
    expect(r2.wasCreated).toBe(false);

    // Evidence count should still be 1 (idempotent)
    const draft = Array.from(store.values())[0]!;
    expect(draft.evidence_count).toBe(1);
    expect(draft.source_tickets).toHaveLength(1);
  });
});

describe('upsertDraftContact — no-overwrite rule', () => {
  it('does NOT overwrite existing display_name when draft already has one', async () => {
    const client = makeMockClient();

    // First call: creates draft with display_name='Johan'
    await upsertDraftContact(client, 'account-1', 'ticket-1', makeCandidate({
      email: 's@disfarma.com.co',
      display_name: 'Johan',
    }));

    // Second call with a different ticket and different name: name should NOT change
    await upsertDraftContact(client, 'account-1', 'ticket-2', makeCandidate({
      email: 's@disfarma.com.co',
      display_name: 'Other Name',
    }));

    const draft = Array.from(store.values())[0]!;
    expect(draft.display_name).toBe('Johan');
    expect(draft.evidence_count).toBe(2);
  });

  it('FILLS empty display_name when draft has null name', async () => {
    const client = makeMockClient();

    // Create draft without display_name
    await upsertDraftContact(client, 'account-1', 'ticket-1', makeCandidate({
      email: 's@disfarma.com.co',
      display_name: null,
    }));

    // Second ticket provides the name
    await upsertDraftContact(client, 'account-1', 'ticket-2', makeCandidate({
      email: 's@disfarma.com.co',
      display_name: 'Johan',
    }));

    const draft = Array.from(store.values())[0]!;
    expect(draft.display_name).toBe('Johan');
  });

  it('origin=external_synced: does NOT touch core fields, but increments evidence', async () => {
    // Manually seed an external_synced draft
    const draftId = 'draft-ext-1';
    store.set(draftId, {
      id: draftId,
      account_id: 'account-1',
      email: 'ext@client.com',
      phone: null,
      display_name: 'External Name',
      organization: 'ExternalCo',
      status: 'confirmed',
      origin: 'external_synced',
      evidence_count: 1,
      source_tickets: ['other-ticket'],
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      confidence: 0.9,
      merged_into_id: null,
      metadata: {},
    });

    const client = makeMockClient();
    await upsertDraftContact(client, 'account-1', 'new-ticket', makeCandidate({
      email: 'ext@client.com',
      display_name: 'New Name', // should NOT be applied
      organization: 'NewOrg',   // should NOT be applied
    }));

    const draft = store.get(draftId)!;
    // Core fields unchanged
    expect(draft.display_name).toBe('External Name');
    expect(draft.organization).toBe('ExternalCo');
    // Evidence incremented
    expect(draft.evidence_count).toBe(2);
    expect(draft.source_tickets).toContain('new-ticket');
  });
});

describe('upsertDraftContact — noop when no identity', () => {
  it('returns wasCreated=false without DB access if both email and phone are null', async () => {
    const client = makeMockClient();
    const c: Candidate = {
      email: null,
      phone: null,
      display_name: 'Anonymous',
      organization: null,
      source: 'from_header',
      evidence_role: 'sender',
    };
    const result = await upsertDraftContact(client, 'account-1', 'ticket-1', c);
    expect(result.wasCreated).toBe(false);
    expect(store.size).toBe(0);
  });
});

describe('upsertDraftContact — evidence accumulation', () => {
  it('accumulates evidence from distinct tickets', async () => {
    const client = makeMockClient();
    const candidate = makeCandidate({ email: 's@disfarma.com.co' });

    await upsertDraftContact(client, 'account-1', 'ticket-1', candidate);
    await upsertDraftContact(client, 'account-1', 'ticket-2', candidate);
    await upsertDraftContact(client, 'account-1', 'ticket-3', candidate);

    const draft = Array.from(store.values())[0]!;
    expect(draft.evidence_count).toBe(3);
    expect(draft.source_tickets).toEqual(['ticket-1', 'ticket-2', 'ticket-3']);
  });

  it('confidence grows with evidence_count (v1 formula)', async () => {
    const client = makeMockClient();

    await upsertDraftContact(client, 'acc', 'ticket-1', makeCandidate({ email: 'a@b.com' }));
    const after1 = Array.from(store.values())[0]!;
    expect(after1.confidence).toBeCloseTo(0.4, 5); // 0.3 + 0.1*1

    await upsertDraftContact(client, 'acc', 'ticket-2', makeCandidate({ email: 'a@b.com' }));
    const after2 = Array.from(store.values())[0]!;
    expect(after2.confidence).toBeCloseTo(0.5, 5); // 0.3 + 0.1*2
  });
});
