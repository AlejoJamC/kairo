-- Migration: canonical_classification_ids
-- KAI-107: Align DB constraints with canonical, language-neutral classification IDs.
--
-- Before: ticket_type/category/sentiment CHECK constraints came from the dead
-- apps/api schema (English but incomplete) while the intelligence prompt emitted
-- Spanish values — every insert either failed or stored stale values.
--
-- After: single canonical vocabulary matching packages/intelligence ClassificationSchema.
--   ticket_type: support | prospect | spam | internal | other
--   priority:    P1 | P2 | P3        (unchanged)
--   category:    technical | billing | account | general | not_applicable
--   sentiment:   aggressive | frustrated | neutral | positive   (holds `tone`)

-- Step 1 — Drop the stale CHECK constraints from migration 005.
ALTER TABLE tickets
  DROP CONSTRAINT IF EXISTS chk_ticket_type,
  DROP CONSTRAINT IF EXISTS chk_priority,
  DROP CONSTRAINT IF EXISTS chk_category,
  DROP CONSTRAINT IF EXISTS chk_sentiment;

-- Step 2 — Remap any legacy Spanish values to canonical English IDs.
-- Idempotent: rows already in the canonical set are unaffected.

UPDATE tickets
SET ticket_type = CASE ticket_type
  WHEN 'soporte'   THEN 'support'
  WHEN 'prospecto' THEN 'prospect'
  WHEN 'lead'      THEN 'prospect'   -- legacy dead-schema value
  WHEN 'interno'   THEN 'internal'
  WHEN 'otro'      THEN 'other'
  ELSE ticket_type
END
WHERE ticket_type IS NOT NULL
  AND ticket_type NOT IN ('support', 'prospect', 'spam', 'internal', 'other');

UPDATE tickets
SET category = CASE category
  WHEN 'tecnico'      THEN 'technical'
  WHEN 'facturacion'  THEN 'billing'
  WHEN 'cuenta'       THEN 'account'
  WHEN 'general'      THEN 'general'
  WHEN 'no_aplica'    THEN 'not_applicable'
  WHEN 'sales'        THEN 'not_applicable'   -- legacy dead-schema value
  WHEN 'other'        THEN 'not_applicable'   -- legacy dead-schema value
  ELSE category
END
WHERE category IS NOT NULL
  AND category NOT IN ('technical', 'billing', 'account', 'general', 'not_applicable');

-- `sentiment` column now stores `tone`. Historical values were either
-- {urgente, neutral, casual} from the dead schema, or NULL (the bug).
-- Map whatever is there into the canonical tone vocabulary.
UPDATE tickets
SET sentiment = CASE sentiment
  WHEN 'urgente'    THEN 'frustrated'
  WHEN 'casual'     THEN 'positive'
  WHEN 'neutral'    THEN 'neutral'
  WHEN 'agresivo'   THEN 'aggressive'
  WHEN 'frustrado'  THEN 'frustrated'
  WHEN 'positivo'   THEN 'positive'
  ELSE sentiment
END
WHERE sentiment IS NOT NULL
  AND sentiment NOT IN ('aggressive', 'frustrated', 'neutral', 'positive');

-- Step 3 — Re-add CHECK constraints with the canonical vocabulary.
ALTER TABLE tickets
  ADD CONSTRAINT chk_ticket_type CHECK (
    ticket_type IS NULL OR
    ticket_type IN ('support', 'prospect', 'spam', 'internal', 'other')
  ),
  ADD CONSTRAINT chk_priority CHECK (
    priority IS NULL OR priority IN ('P1', 'P2', 'P3')
  ),
  ADD CONSTRAINT chk_category CHECK (
    category IS NULL OR
    category IN ('technical', 'billing', 'account', 'general', 'not_applicable')
  ),
  ADD CONSTRAINT chk_sentiment CHECK (
    sentiment IS NULL OR
    sentiment IN ('aggressive', 'frustrated', 'neutral', 'positive')
  );
