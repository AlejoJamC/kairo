import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findExistingDraft, detectWeakMatches } from '../dedup.js';
import type { DraftContact } from '../dedup.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDraft(overrides: Partial<DraftContact> = {}): DraftContact {
  return {
    id: 'draft-a',
    account_id: 'acc-1',
    display_name: 'Test User',
    email: 'test@example.com',
    phone: '+573001234567',
    organization: 'Acme',
    confidence: 0.8,
    confirmed_at: null,
    confirmed_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    first_seen_at: new Date().toISOString(),
    last_seen_at: new Date().toISOString(),
    evidence_count: 1,
    external_ref: null,
    external_source: null,
    merged_into_id: null,
    metadata: {},
    origin: 'kairo_created',
    source_tickets: [],
    status: 'pending',
    ...overrides,
  };
}

/**
 * Creates a Supabase-like query builder mock for .maybeSingle() usage
 * (used by findExistingDraft).
 */
function makeClient(
  resolveWith: (
    table: string,
    filters: Record<string, string>,
  ) => { data: DraftContact | null; error: null | { message: string } },
) {
  const buildChain = (table: string, filters: Record<string, string>): Record<string, unknown> => ({
    select: (_cols: string) => buildChain(table, filters),
    eq: (col: string, val: string) => buildChain(table, { ...filters, [col]: val }),
    ilike: (col: string, val: string) => buildChain(table, { ...filters, [`ilike:${col}`]: val }),
    limit: (_n: number) => buildChain(table, filters),
    maybeSingle: () => Promise.resolve(resolveWith(table, filters)),
  });

  return { from: (table: string) => buildChain(table, {}) };
}

/**
 * Creates a mock that returns arrays (for detectWeakMatches which awaits directly).
 * `resolveWith` is called per query and must return a { data, error } with an array.
 */
function makeListClient(
  resolveWith: (
    filters: Record<string, string>,
    callIndex: number,
  ) => { data: DraftContact[]; error: null | { message: string } },
) {
  let callIndex = 0;

  const buildChain = (filters: Record<string, string>): Record<string, unknown> => {
    const chain: Record<string, unknown> = {
      select: (_cols: string) => buildChain(filters),
      eq: (col: string, val: string) => buildChain({ ...filters, [col]: val }),
      ilike: (col: string, val: string) => buildChain({ ...filters, [`ilike:${col}`]: val }),
      limit: (_n: number) => buildChain(filters),
      // Promise thenable — makes `await chain` resolve via this
      then: (
        resolve: (v: { data: DraftContact[]; error: null | { message: string } }) => void,
        _reject?: (e: unknown) => void,
      ) => {
        const result = resolveWith(filters, callIndex++);
        resolve(result);
      },
    };
    return chain;
  };

  return { from: (_table: string) => buildChain({}) };
}

// ---------------------------------------------------------------------------
// findExistingDraft
// ---------------------------------------------------------------------------

describe('findExistingDraft', () => {
  const ACCOUNT = 'acc-1';

  it('returns draft when email matches', async () => {
    const draft = makeDraft({ id: 'draft-a', email: 'test@example.com' });
    const client = makeClient((_table, filters) => {
      if (filters['email'] === 'test@example.com') return { data: draft, error: null };
      return { data: null, error: null };
    });

    const result = await findExistingDraft(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ACCOUNT,
      { email: 'test@example.com' },
    );
    expect(result).toEqual(draft);
  });

  it('returns null when no email or phone match', async () => {
    const client = makeClient(() => ({ data: null, error: null }));

    const result = await findExistingDraft(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ACCOUNT,
      { email: 'nobody@example.com' },
    );
    expect(result).toBeNull();
  });

  it('falls back to phone when email does not match', async () => {
    const phoneDraft = makeDraft({ id: 'draft-b', email: null, phone: '+573001234567' });
    const client = makeClient((_table, filters) => {
      if (filters['phone'] === '+573001234567') return { data: phoneDraft, error: null };
      return { data: null, error: null };
    });

    const result = await findExistingDraft(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ACCOUNT,
      { email: 'nobody@example.com', phone: '+573001234567' },
    );
    expect(result).toEqual(phoneDraft);
  });

  it('returns email match and warns when email→A and phone→B (different drafts)', async () => {
    const draftA = makeDraft({ id: 'draft-a', email: 'a@example.com' });
    const draftB = makeDraft({ id: 'draft-b', phone: '+573001234567' });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const client = makeClient((_table, filters) => {
      if (filters['email'] === 'a@example.com') return { data: draftA, error: null };
      if (filters['phone'] === '+573001234567') return { data: draftB, error: null };
      return { data: null, error: null };
    });

    const result = await findExistingDraft(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ACCOUNT,
      { email: 'a@example.com', phone: '+573001234567' },
    );

    expect(result).toEqual(draftA);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('MERGE_CANDIDATE'),
      'draft-a',
      'draft-b',
    );

    warnSpy.mockRestore();
  });

  it('warns and continues on email query error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const client = makeClient((_table, filters) => {
      if ('email' in filters) {
        return { data: null, error: { message: 'db error' } };
      }
      return { data: null, error: null };
    });

    const result = await findExistingDraft(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ACCOUNT,
      { email: 'a@example.com' },
    );

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('email query error'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it('warns and continues on phone query error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const client = makeClient((_table, filters) => {
      if ('phone' in filters) {
        return { data: null, error: { message: 'db error' } };
      }
      return { data: null, error: null };
    });

    const result = await findExistingDraft(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ACCOUNT,
      { phone: '+573001234567' },
    );

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('phone query error'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it('returns null when no identifiers are provided', async () => {
    const client = makeClient(() => ({ data: null, error: null }));
    const result = await findExistingDraft(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      ACCOUNT,
      {},
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// detectWeakMatches
// ---------------------------------------------------------------------------

describe('detectWeakMatches', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns drafts matching display_name ilike', async () => {
    const drafts = [
      makeDraft({ id: 'draft-1', display_name: 'Johan Hurtado' }),
      makeDraft({ id: 'draft-2', display_name: 'Johan Perez' }),
    ];

    const client = makeListClient((_filters, callIdx) => ({
      data: callIdx === 0 ? drafts : [],
      error: null,
    }));

    const result = await detectWeakMatches(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'acc-1',
      { displayName: 'Johan' },
    );

    expect(result).toHaveLength(2);
    expect(result.map((d) => d.id)).toContain('draft-1');
    expect(result.map((d) => d.id)).toContain('draft-2');
  });

  it('returns empty array when no matches', async () => {
    const client = makeListClient(() => ({ data: [], error: null }));

    const result = await detectWeakMatches(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'acc-1',
      { displayName: 'Unknown' },
    );

    expect(result).toHaveLength(0);
  });

  it('returns drafts matching organization ilike (no displayName)', async () => {
    const orgDraft = makeDraft({ id: 'draft-org', organization: 'Acme Corp' });

    const client = makeListClient((_filters, callIdx) => ({
      data: callIdx === 0 ? [orgDraft] : [],
      error: null,
    }));

    const result = await detectWeakMatches(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'acc-1',
      { organization: 'Acme' },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('draft-org');
  });

  it('de-duplicates when same draft matches both displayName and organization', async () => {
    const draft = makeDraft({ id: 'draft-dup', display_name: 'Johan', organization: 'Acme' });

    // First call (displayName) returns the draft, second call (organization) also returns same draft
    const client = makeListClient(() => ({
      data: [draft],
      error: null,
    }));

    const result = await detectWeakMatches(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'acc-1',
      { displayName: 'Johan', organization: 'Acme' },
    );

    // Should deduplicate — only 1 result
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('draft-dup');
  });

  it('warns and returns empty on display_name query error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const client = makeListClient(() => ({
      data: [],
      error: { message: 'db error' },
    }));

    const result = await detectWeakMatches(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'acc-1',
      { displayName: 'Broken' },
    );

    expect(result).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('display_name query error'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it('warns on organization query error and still returns displayName matches', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const draft = makeDraft({ id: 'draft-ok', display_name: 'Johan' });

    const client = makeListClient((_filters, callIdx) => {
      if (callIdx === 0) return { data: [draft], error: null };
      // Organization query fails
      return { data: [], error: { message: 'org error' } };
    });

    const result = await detectWeakMatches(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client as any,
      'acc-1',
      { displayName: 'Johan', organization: 'Acme' },
    );

    expect(result).toHaveLength(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('organization query error'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });
});
