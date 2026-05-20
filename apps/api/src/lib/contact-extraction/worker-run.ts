import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

/**
 * Generic worker-run observability helpers.
 *
 * Operate on the `worker_runs` table. These are intentionally worker-agnostic
 * so any future Inngest worker can reuse them without changes.
 *
 * All writes use the service-role client — RLS write is not granted to users.
 */

export interface StartWorkerRunParams {
  worker: string;
  accountId: string;
  triggerEvent: string;
  triggerPayload: unknown;
}

/**
 * Inserts a `worker_runs` row with `status='running'`.
 *
 * @returns The UUID of the created run (used by finishWorkerRun / failWorkerRun).
 * @throws if the insert fails.
 */
export async function startWorkerRun(
  client: DbClient,
  params: StartWorkerRunParams,
): Promise<string> {
  const { data, error } = await client
    .from('worker_runs')
    .insert({
      worker: params.worker,
      account_id: params.accountId,
      trigger_event: params.triggerEvent,
      trigger_payload: params.triggerPayload as Record<string, unknown>,
      status: 'running',
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(`[worker-run] startWorkerRun failed: ${error?.message ?? 'no data returned'}`);
  }
  return data.id;
}

/**
 * Marks a run as `succeeded`, records `finished_at` and `duration_ms`.
 *
 * @throws if the update fails (the run should still be inspectable in the DB).
 */
export async function finishWorkerRun(
  client: DbClient,
  runId: string,
  result: unknown,
): Promise<void> {
  const finishedAt = new Date().toISOString();

  // Fetch started_at to compute duration
  const { data: row } = await client
    .from('worker_runs')
    .select('started_at')
    .eq('id', runId)
    .maybeSingle();

  const durationMs = row?.started_at
    ? Math.round(Date.now() - new Date(row.started_at).getTime())
    : null;

  const { error } = await client
    .from('worker_runs')
    .update({
      status: 'succeeded',
      finished_at: finishedAt,
      duration_ms: durationMs ?? undefined,
      result: result as Record<string, unknown>,
    })
    .eq('id', runId);

  if (error) {
    throw new Error(`[worker-run] finishWorkerRun failed for run ${runId}: ${error.message}`);
  }
}

/**
 * Marks a run as `failed`, records `finished_at` and the error detail.
 *
 * Never throws — failure helpers must be safe to call from catch/finally blocks.
 */
export async function failWorkerRun(
  client: DbClient,
  runId: string,
  err: unknown,
): Promise<void> {
  try {
    const finishedAt = new Date().toISOString();

    const { data: row } = await client
      .from('worker_runs')
      .select('started_at')
      .eq('id', runId)
      .maybeSingle();

    const durationMs = row?.started_at
      ? Math.round(Date.now() - new Date(row.started_at).getTime())
      : null;

    const errorPayload: Record<string, unknown> = {
      code: 'WORKER_ERROR',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? (err.stack ?? null) : null,
    };

    await client
      .from('worker_runs')
      .update({
        status: 'failed',
        finished_at: finishedAt,
        duration_ms: durationMs ?? undefined,
        error: errorPayload,
      })
      .eq('id', runId);
  } catch (updateErr) {
    // Log but do not re-throw — we're already in an error path.
    console.error(`[worker-run] failWorkerRun: could not update run ${runId}:`, updateErr);
  }
}
