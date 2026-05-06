-- LLM Observability: llm_calls table
--
-- Captures every prompt sent to any LLM provider so Kairo Intelligence can:
--   1. Detect quality regressions across prompt versions
--   2. Build fine-tuning datasets from accepted/rejected agent outcomes
--   3. Feed the offline eval pipeline (scripts/eval/) with production data
--   4. A/B test prompt versions and measure real-world accuracy
--   5. Monitor latency, token usage, and cost per feature/model
--
-- This is an append-only observability table — NEVER update or delete rows.
-- Rows flow from every createCompletionProvider().complete() call site.
-- Outcome is written back async when the agent acts on the suggestion
-- (accept/reject/ignore) — it starts NULL and is filled by a separate update.
--
-- See packages/intelligence/OBSERVABILITY.md for instrumentation guide.

CREATE TABLE IF NOT EXISTS public.llm_calls (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Caller context
  user_id          UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  ticket_id        UUID        REFERENCES public.tickets(id) ON DELETE SET NULL,
  feature          TEXT        NOT NULL,
  -- e.g. 'email_classification' | 'reply_suggestion' | 'kb_search' | 'summarization'

  -- Model metadata
  provider         TEXT        NOT NULL,  -- 'anthropic' | 'ollama' | 'voyage'
  model            TEXT        NOT NULL,  -- 'claude-sonnet-4-6' | 'llama3.2' | etc.
  prompt_version   TEXT,                  -- semver from prompt frontmatter e.g. '2.1.0'

  -- Prompt + response (source of truth for fine-tuning)
  prompt_text      TEXT        NOT NULL,
  response_text    TEXT,                  -- NULL if call failed
  prompt_tokens    INTEGER,
  completion_tokens INTEGER,

  -- Quality signals
  confidence_score NUMERIC(4,3),          -- model-reported confidence 0..1
  latency_ms       INTEGER,               -- wall-clock time of the API call

  -- Agent outcome (written back when agent acts — starts NULL)
  outcome          TEXT,
  -- 'accepted' | 'edited' | 'rejected' | 'ignored' | 'auto_applied'
  outcome_recorded_at TIMESTAMPTZ,

  -- Error capture
  error_code       TEXT,                  -- NULL on success
  error_detail     TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT llm_calls_confidence_check CHECK (
    confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)
  ),
  CONSTRAINT llm_calls_outcome_check CHECK (
    outcome IS NULL OR outcome IN ('accepted', 'edited', 'rejected', 'ignored', 'auto_applied')
  )
);

-- Fast lookups for eval pipeline and dashboards
CREATE INDEX IF NOT EXISTS idx_llm_calls_ticket_id    ON public.llm_calls(ticket_id);
CREATE INDEX IF NOT EXISTS idx_llm_calls_feature      ON public.llm_calls(feature);
CREATE INDEX IF NOT EXISTS idx_llm_calls_model        ON public.llm_calls(model);
CREATE INDEX IF NOT EXISTS idx_llm_calls_outcome      ON public.llm_calls(outcome) WHERE outcome IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_calls_created_at   ON public.llm_calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_calls_prompt_version ON public.llm_calls(feature, prompt_version);

-- RLS: users can only view their own calls; service role writes all
ALTER TABLE public.llm_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own llm calls"
  ON public.llm_calls FOR SELECT
  USING (auth.uid() = user_id);

-- No INSERT policy for users — writes go through service role (API only)
-- No UPDATE policy for users — outcome is written back via service role
