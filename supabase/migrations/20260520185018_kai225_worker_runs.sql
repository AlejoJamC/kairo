CREATE TABLE public.worker_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker          text NOT NULL,                       -- 'contact_extraction', futuros: 'csat_followup', etc.
  account_id      uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  trigger_event   text,                                -- 'tickets/ticket.created'
  trigger_payload jsonb,                               -- el data del evento o pointers (ticket_id, etc.)
  status          text NOT NULL,                       -- 'running' | 'succeeded' | 'failed'
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  duration_ms     integer,
  result          jsonb,                               -- worker-defined: candidates_count, drafts_created, ...
  error           jsonb,                               -- { code, message, stack }
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT worker_runs_status_check
    CHECK (status IN ('running','succeeded','failed')),
  CONSTRAINT worker_runs_finished_consistency
    CHECK ((status = 'running' AND finished_at IS NULL)
        OR (status <> 'running' AND finished_at IS NOT NULL))
);

CREATE INDEX idx_worker_runs_account_worker_started
  ON public.worker_runs (account_id, worker, started_at DESC);

CREATE INDEX idx_worker_runs_status_running
  ON public.worker_runs (started_at)
  WHERE status = 'running';

ALTER TABLE public.worker_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY worker_runs_select ON public.worker_runs
  FOR SELECT
  USING (account_id = public.current_account_id());

-- INSERT/UPDATE solo desde service_role (worker). No RLS write para usuarios.

COMMENT ON TABLE public.worker_runs IS
  'Observabilidad genérica de runs de workers Inngest. Una fila por ejecución. Worker-agnóstica. KAI-225.';
