-- Migration: ticket_proposals_emotion
-- KAI-18: Connect tier pipeline to ticket_proposals (Option A).
--
-- Makes conversation_id nullable so the email classification tiers can
-- create proposals without a conversation context (they work with raw
-- Gmail messages, not omnichannel conversations).
-- Adds proposed_emotion and emotion_confidence columns so the staging
-- record carries the full classification output before ticket creation.

ALTER TABLE ticket_proposals
  ALTER COLUMN conversation_id DROP NOT NULL;

ALTER TABLE ticket_proposals
  ADD COLUMN IF NOT EXISTS proposed_emotion    TEXT,
  ADD COLUMN IF NOT EXISTS emotion_confidence  DECIMAL(3,2);

ALTER TABLE ticket_proposals
  ADD CONSTRAINT chk_proposed_emotion CHECK (
    proposed_emotion IS NULL OR
    proposed_emotion IN ('aggressive', 'frustrated', 'neutral', 'positive')
  );
