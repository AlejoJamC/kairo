-- KAI-40: off-hours auto-response idempotency markers on tickets
--
-- When the Gmail sync pipeline ingests a ticket outside the tenant's configured
-- support hours, it sends a templated auto-reply and records it here. The
-- markers prevent the same Gmail thread from being auto-replied more than once.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS auto_replied_out_of_hours BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_replied_at TIMESTAMPTZ;

-- Idempotency lookup: "has any ticket on this thread already been auto-replied for this user?"
CREATE INDEX IF NOT EXISTS idx_tickets_auto_replied_thread
  ON tickets (user_id, gmail_thread_id)
  WHERE auto_replied_out_of_hours = true;
