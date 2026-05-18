-- ADR-022 Sub-fase 3d: rename user_id to explicit audit field names in feedback tables
-- Tables: classification_feedback, llm_calls

-- ─────────────────────────────────────────────────────────────────────────────
-- classification_feedback: user_id → submitted_by_user_id
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_classification_feedback_user_id;

ALTER TABLE public.classification_feedback
  RENAME COLUMN user_id TO submitted_by_user_id;

-- Make nullable + change ON DELETE behavior to SET NULL
ALTER TABLE public.classification_feedback
  ALTER COLUMN submitted_by_user_id DROP NOT NULL;

ALTER TABLE public.classification_feedback
  DROP CONSTRAINT IF EXISTS classification_feedback_user_id_fkey;

ALTER TABLE public.classification_feedback
  ADD CONSTRAINT classification_feedback_submitted_by_user_id_fkey
  FOREIGN KEY (submitted_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX idx_classification_feedback_submitted_by
  ON public.classification_feedback (submitted_by_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- llm_calls: user_id → triggered_by_user_id  (was already nullable)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.llm_calls
  RENAME COLUMN user_id TO triggered_by_user_id;

ALTER TABLE public.llm_calls
  DROP CONSTRAINT IF EXISTS llm_calls_user_id_fkey;

ALTER TABLE public.llm_calls
  ADD CONSTRAINT llm_calls_triggered_by_user_id_fkey
  FOREIGN KEY (triggered_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
