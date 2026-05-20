import { describe, it, expect } from 'bun:test';
import { startWorkerRun, finishWorkerRun, failWorkerRun } from '../worker-run.js';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Mock Supabase client builder
// ---------------------------------------------------------------------------

/**
 * Creates a minimal mock Supabase client that captures inserts and updates
 * to `worker_runs` in an in-memory store.
 */
function makeMockClient() {
  const rows: Map<string, Record<string, unknown>> = new Map();
  let idCounter = 0;

  const client = {
    from(table: string) {
      if (table !== 'worker_runs') {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        insert(data: Record<string, unknown>) {
          const id = `run-${++idCounter}`;
          const row = { id, started_at: new Date().toISOString(), ...data };
          rows.set(id, row);
          return {
            select(_cols: string) {
              return {
                single() {
                  return Promise.resolve({ data: { id }, error: null });
                },
              };
            },
          };
        },
        select(_cols: string) {
          return {
            eq(_col: string, id: string) {
              return {
                maybeSingle() {
                  return Promise.resolve({ data: rows.get(id) ?? null, error: null });
                },
              };
            },
          };
        },
        update(updates: Record<string, unknown>) {
          return {
            eq(_col: string, id: string) {
              const existing = rows.get(id);
              if (existing) {
                rows.set(id, { ...existing, ...updates });
              }
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
    // Expose rows for assertions
    _rows: rows,
  };

  return client as unknown as // eslint-disable-next-line @typescript-eslint/no-explicit-any
SupabaseClient<any> & { _rows: Map<string, Record<string, unknown>> };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('startWorkerRun', () => {
  it('inserts a row with status=running and returns a runId', async () => {
    const client = makeMockClient();
    const runId = await startWorkerRun(client, {
      worker: 'contact_extraction',
      accountId: 'account-1',
      triggerEvent: 'tickets/ticket.created',
      triggerPayload: { ticketId: 'ticket-1', accountId: 'account-1' },
    });

    expect(typeof runId).toBe('string');
    expect(runId.length).toBeGreaterThan(0);
  });
});

describe('finishWorkerRun', () => {
  it('updates the row to status=succeeded with result', async () => {
    const client = makeMockClient();
    const runId = await startWorkerRun(client, {
      worker: 'contact_extraction',
      accountId: 'account-1',
      triggerEvent: 'tickets/ticket.created',
      triggerPayload: { ticketId: 'ticket-1' },
    });

    const result = { candidates_count: 2, drafts_created: 1, drafts_updated: 0, excluded_count: 1 };
    await finishWorkerRun(client, runId, result);

    const row = client._rows.get(runId)!;
    expect(row.status).toBe('succeeded');
    expect(row.finished_at).toBeDefined();
    expect(row.result).toEqual(result);
    expect(row.duration_ms).toBeDefined();
  });
});

describe('failWorkerRun', () => {
  it('updates the row to status=failed with error detail', async () => {
    const client = makeMockClient();
    const runId = await startWorkerRun(client, {
      worker: 'contact_extraction',
      accountId: 'account-1',
      triggerEvent: 'tickets/ticket.created',
      triggerPayload: { ticketId: 'ticket-1' },
    });

    const err = new Error('Something went wrong');
    await failWorkerRun(client, runId, err);

    const row = client._rows.get(runId)!;
    expect(row.status).toBe('failed');
    expect(row.finished_at).toBeDefined();
    const errPayload = row.error as Record<string, unknown>;
    expect(errPayload.message).toBe('Something went wrong');
    expect(errPayload.code).toBe('WORKER_ERROR');
  });

  it('does not throw even if the update fails (safe for catch blocks)', async () => {
    // Client that always returns an error on update
    const client = {
      from() {
        return {
          insert() {
            return {
              select() {
                return {
                  single: () => Promise.resolve({ data: { id: 'x' }, error: null }),
                };
              },
            };
          },
          select() {
            return {
              eq() {
                return {
                  maybeSingle: () => Promise.resolve({ data: { started_at: new Date().toISOString() }, error: null }),
                };
              },
            };
          },
          update() {
            return {
              eq() {
                return Promise.resolve({ error: { message: 'DB down' } });
              },
            };
          },
        };
      },
    } as unknown as // eslint-disable-next-line @typescript-eslint/no-explicit-any
SupabaseClient<any>;

    // Should not throw
    await expect(failWorkerRun(client, 'x', new Error('test'))).resolves.toBeUndefined();
  });
});
