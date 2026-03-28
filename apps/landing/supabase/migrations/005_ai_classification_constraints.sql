-- Migration: 005_ai_classification_constraints
-- KAI-5: Tighten + extend DB schema for AI classification
-- Adds CHECK constraints to existing classification columns and new AI metadata columns.

-- Step 1: Clean legacy data — nullify sentiment values outside the correct enum.
UPDATE tickets
SET sentiment = NULL
WHERE sentiment IS NOT NULL
  AND sentiment NOT IN ('urgente', 'neutral', 'casual');

-- Step 2: Add named CHECK constraints to the 4 existing classification columns.
-- All allow NULL (columns remain nullable — NULL means not yet classified).
ALTER TABLE tickets
  ADD CONSTRAINT chk_ticket_type CHECK (ticket_type IS NULL OR ticket_type IN ('support', 'lead', 'spam')),
  ADD CONSTRAINT chk_priority    CHECK (priority    IS NULL OR priority    IN ('P1', 'P2', 'P3')),
  ADD CONSTRAINT chk_category    CHECK (category    IS NULL OR category    IN ('technical', 'billing', 'sales', 'other')),
  ADD CONSTRAINT chk_sentiment   CHECK (sentiment   IS NULL OR sentiment   IN ('urgente', 'neutral', 'casual'));

-- Step 3: Add 3 new AI metadata columns.
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS ai_reasoning               TEXT,
  ADD COLUMN IF NOT EXISTS classified_at              TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS classification_confidence  DECIMAL(3,2);
