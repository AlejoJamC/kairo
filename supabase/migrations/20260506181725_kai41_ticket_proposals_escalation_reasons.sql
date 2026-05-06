-- KAI-41: store detected escalation triggers in ticket_proposals
ALTER TABLE ticket_proposals
  ADD COLUMN IF NOT EXISTS escalation_reasons JSONB NOT NULL DEFAULT '[]';
