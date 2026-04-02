-- Migration: 006_add_classification_tier
-- KAI-7: Add classification_tier column for tracking pipeline tier used
-- Tier 1 = synchronous single-ticket classification
-- Tier 2+ = batch/pipeline (future)

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS classification_tier INT;
