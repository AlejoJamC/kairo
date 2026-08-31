-- KAI-93: where the tenant's line of business lives.
--
-- `business_context` answers "what does this company do", and the classification
-- rubric names that block as what separates `support` from `internal`. On the
-- KAI-93 bench it moved macro F1 by a median of +0.082 on the backfill stage
-- across all five models, and it also moves the confidence the model declares:
-- without it, eight of ten measured cells came back underconfident (gemma4
-- declared 0.631 while getting 0.860 right).
--
-- Nullable with no default and no backfill: today no account has one. The column
-- exists so that whenever a value appears -- derived, or written by a human --
-- every classifier call from that moment on picks it up. Nothing is
-- reclassified because of it: a value arriving later changes what the next
-- email sees, never what an already-classified one saw.
--
-- Tier 1 never reads this column. The onboarding fast path is measured to be
-- *worse* with the context (-0.073 macro F1 on the best model of that column),
-- and it runs before any such value could exist anyway. The rule is enforced in
-- code, at apps/api/src/lib/classifier-input.ts.

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS business_context            text,
  ADD COLUMN IF NOT EXISTS business_context_updated_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS business_context_source     text;

-- `source` is not decoration: a description a person wrote and one the product
-- inferred are different inputs, and only the second is the thing the bench
-- measured. Whoever reads a bad classification later needs to know which one
-- was in the prompt.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_business_context_source'
  ) THEN
    ALTER TABLE public.accounts
      ADD CONSTRAINT chk_business_context_source
      CHECK (business_context_source IS NULL
             OR business_context_source IN ('derived', 'manual'));
  END IF;
END
$$;

COMMENT ON COLUMN public.accounts.business_context IS
  'What this company does, in prose, for the {{business_context}} block of the '
  'email-classification rubric. NULL means the rubric renders "(no disponible)". '
  'Read only by the backfill stage (tier 2/3, incremental-sync, gmail-poll, '
  'reclassify endpoints) -- never by tier 1 (KAI-93).';

COMMENT ON COLUMN public.accounts.business_context_updated_at IS
  'When business_context last changed. The value is expected to be refined over '
  'time; this dates the text that a given classification saw.';

COMMENT ON COLUMN public.accounts.business_context_source IS
  'derived = inferred by Kairo from the account''s own mail; manual = written by '
  'a person. Only "derived" corresponds to what the KAI-93 bench measured.';
