-- =====================================================================
-- 003_kairo_core_schema.sql
-- Kairo Core Schema — Omnichannel Help Desk + AI Triage
-- =====================================================================
-- What this migration does:
--   1. Deprecates Gmail-specific columns on tickets (data preserved,
--      NOT NULL constraints relaxed, old UNIQUE dropped)
--   2. Adds omnichannel columns to tickets
--   3. Creates: channel_integrations, conversations, messages
--   4. Creates: ticket_messages, ticket_events, ticket_followers,
--               ticket_tags, ticket_proposals
--   5. Creates: categorization_feedback, category_confidence_thresholds
-- =====================================================================

BEGIN;

-- =====================================================================
-- STEP 1 — DEPRECATE GMAIL-SPECIFIC COLUMNS ON tickets
-- =====================================================================
-- The following columns are logically deprecated. Their data is NOT
-- dropped here. Archive them before running a future cleanup migration:
--
--   SELECT id, gmail_message_id, gmail_thread_id, from_email, from_name,
--          to_email, cc_emails, body_plain, body_html, snippet, received_at
--   FROM public.tickets;
--
-- Deprecated columns (still present, now nullable):
--   gmail_message_id   TEXT  — was NOT NULL, UNIQUE with user_id
--   gmail_thread_id    TEXT
--   from_email         TEXT  — was NOT NULL
--   from_name          TEXT
--   to_email           TEXT
--   cc_emails          TEXT[]
--   body_plain         TEXT
--   body_html          TEXT
--   snippet            TEXT
--   received_at        TIMESTAMPTZ — was NOT NULL
--
-- Future cleanup (run AFTER archiving data):
--   ALTER TABLE public.tickets
--     DROP COLUMN gmail_message_id,
--     DROP COLUMN gmail_thread_id,
--     DROP COLUMN from_email,
--     DROP COLUMN from_name,
--     DROP COLUMN to_email,
--     DROP COLUMN cc_emails,
--     DROP COLUMN body_plain,
--     DROP COLUMN body_html,
--     DROP COLUMN snippet,
--     DROP COLUMN received_at;
-- =====================================================================

-- Relax NOT NULL constraints so non-Gmail tickets can be inserted
ALTER TABLE public.tickets ALTER COLUMN gmail_message_id DROP NOT NULL;
ALTER TABLE public.tickets ALTER COLUMN from_email DROP NOT NULL;
ALTER TABLE public.tickets ALTER COLUMN received_at DROP NOT NULL;

-- Drop the Gmail-specific composite UNIQUE (user_id, gmail_message_id)
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_user_id_gmail_message_id_key;

-- Ensure status has DEFAULT 'open' (it did already, but make it explicit)
ALTER TABLE public.tickets ALTER COLUMN status SET DEFAULT 'open';

-- =====================================================================
-- STEP 2 — ADD NEW COLUMNS TO tickets
-- (FK constraints added later, after referenced tables exist)
-- =====================================================================

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS ticket_number           bigint       GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN IF NOT EXISTS conversation_id         uuid         NULL,
  ADD COLUMN IF NOT EXISTS parent_ticket_id        uuid         NULL,
  ADD COLUMN IF NOT EXISTS merged_into_ticket_id   uuid         NULL,
  ADD COLUMN IF NOT EXISTS channel                 text         NOT NULL DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS first_response_at       timestamptz  NULL,
  ADD COLUMN IF NOT EXISTS sla_due_at              timestamptz  NULL,
  ADD COLUMN IF NOT EXISTS sla_breached            boolean      NOT NULL DEFAULT false;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_ticket_number_key UNIQUE (ticket_number);

-- =====================================================================
-- STEP 3 — channel_integrations
-- One row per connected account per workspace (Gmail, Instagram, etc.)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.channel_integrations (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider              text        NOT NULL,
  external_account_id   text        NOT NULL,
  display_name          text        NULL,
  credentials_encrypted jsonb       NULL,   -- store encrypted OAuth tokens, never plain text
  is_active             boolean     NOT NULL DEFAULT true,
  last_synced_at        timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_integrations_user_provider_account_key
    UNIQUE (user_id, provider, external_account_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_integrations_provider
  ON public.channel_integrations(provider);
CREATE INDEX IF NOT EXISTS idx_channel_integrations_user_id
  ON public.channel_integrations(user_id);

ALTER TABLE public.channel_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own channel integrations"
  ON public.channel_integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own channel integrations"
  ON public.channel_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own channel integrations"
  ON public.channel_integrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own channel integrations"
  ON public.channel_integrations FOR DELETE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_channel_integrations_updated ON public.channel_integrations;
CREATE TRIGGER on_channel_integrations_updated
  BEFORE UPDATE ON public.channel_integrations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================================
-- STEP 4 — conversations
-- Persistent top-level thread between a customer and the workspace.
-- Never closed; represents the full relationship history.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.conversations (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_integration_id  uuid        NOT NULL REFERENCES public.channel_integrations(id) ON DELETE RESTRICT,
  customer_external_id    text        NOT NULL,  -- Instagram ID, WhatsApp number, Gmail address, etc.
  customer_display_name   text        NULL,
  customer_avatar_url     text        NULL,
  status                  text        NOT NULL DEFAULT 'active',  -- 'active' | 'archived'
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_integration_customer_key
    UNIQUE (channel_integration_id, customer_external_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_id
  ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_channel_integration_id
  ON public.conversations(channel_integration_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer_external_id
  ON public.conversations(customer_external_id);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversations"
  ON public.conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON public.conversations FOR UPDATE
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS on_conversations_updated ON public.conversations;
CREATE TRIGGER on_conversations_updated
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================================
-- STEP 5 — messages
-- Channel-agnostic individual messages within a conversation.
-- Channel-specific data lives exclusively in raw_payload.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.messages (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id         uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  channel_integration_id  uuid        NOT NULL REFERENCES public.channel_integrations(id) ON DELETE RESTRICT,
  external_id             text        NOT NULL,   -- gmail_message_id, instagram mid, whatsapp wamid, etc.
  thread_external_id      text        NULL,        -- gmail_thread_id, instagram thread, etc.
  direction               text        NOT NULL,   -- 'inbound' | 'outbound'
  sender_external_id      text        NULL,
  sender_display_name     text        NULL,
  body_plain              text        NULL,
  body_html               text        NULL,
  snippet                 text        NULL,        -- short preview for list views
  raw_payload             jsonb       NOT NULL,   -- full original API response, source of truth
  received_at             timestamptz NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_integration_external_id_key
    UNIQUE (channel_integration_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
  ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread_external_id
  ON public.messages(thread_external_id);
CREATE INDEX IF NOT EXISTS idx_messages_received_at
  ON public.messages(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_direction
  ON public.messages(direction);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Access via conversation ownership
CREATE POLICY "Users can view own messages"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND c.user_id = auth.uid()
    )
  );

-- =====================================================================
-- STEP 6 — ADD FK CONSTRAINTS TO tickets
-- Now that conversations exists we can add the foreign keys.
-- =====================================================================

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_conversation_id_fkey
    FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE RESTRICT,
  ADD CONSTRAINT tickets_parent_ticket_id_fkey
    FOREIGN KEY (parent_ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL,
  ADD CONSTRAINT tickets_merged_into_ticket_id_fkey
    FOREIGN KEY (merged_into_ticket_id) REFERENCES public.tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_conversation_id
  ON public.tickets(conversation_id);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_number
  ON public.tickets(ticket_number);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to
  ON public.tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_due_at
  ON public.tickets(sla_due_at);

-- =====================================================================
-- STEP 7 — ticket_messages
-- Join table: a message can belong to multiple tickets (1:N).
-- Tracks which message was the origin trigger for the ticket.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ticket_messages (
  ticket_id   uuid        NOT NULL REFERENCES public.tickets(id)  ON DELETE CASCADE,
  message_id  uuid        NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  is_origin   boolean     NOT NULL DEFAULT false,  -- the message that triggered ticket creation
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, message_id)
);

-- Reverse lookup: which tickets reference this message?
CREATE INDEX IF NOT EXISTS idx_ticket_messages_message_id
  ON public.ticket_messages(message_id);

ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ticket_messages"
  ON public.ticket_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_messages.ticket_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own ticket_messages"
  ON public.ticket_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
        AND t.user_id = auth.uid()
    )
  );

-- =====================================================================
-- STEP 8 — ticket_events
-- Immutable audit trail. Never update or delete rows.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ticket_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid        NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  author_id   uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,  -- null = system/AI
  event_type  text        NOT NULL,
  -- 'reply' | 'internal_note' | 'status_change' | 'assignment'
  -- | 'merge' | 'ai_proposal' | 'ai_confirmed' | 'ai_rejected' | 'sla_breach'
  body        text        NULL,
  is_internal boolean     NOT NULL DEFAULT false,
  metadata    jsonb       NULL,  -- e.g. { "from_status": "open", "to_status": "resolved" }
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id
  ON public.ticket_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_events_event_type
  ON public.ticket_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ticket_events_author_id
  ON public.ticket_events(author_id);

ALTER TABLE public.ticket_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ticket events"
  ON public.ticket_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_events.ticket_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own ticket events"
  ON public.ticket_events FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
        AND t.user_id = auth.uid()
    )
  );

-- =====================================================================
-- STEP 9 — ticket_followers
-- Users following a ticket for notifications (independent of assignment).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ticket_followers (
  ticket_id   uuid        NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, user_id)
);

ALTER TABLE public.ticket_followers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own follows"
  ON public.ticket_followers FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own follows"
  ON public.ticket_followers FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own follows"
  ON public.ticket_followers FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================================
-- STEP 10 — ticket_tags
-- Flexible labeling system, independent of the category column.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ticket_tags (
  ticket_id   uuid        NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  tag         text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, tag)
);

-- Filter all tickets with a given tag across workspace
CREATE INDEX IF NOT EXISTS idx_ticket_tags_tag
  ON public.ticket_tags(tag);

ALTER TABLE public.ticket_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ticket tags"
  ON public.ticket_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_tags.ticket_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own ticket tags"
  ON public.ticket_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_id
        AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own ticket tags"
  ON public.ticket_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_tags.ticket_id
        AND t.user_id = auth.uid()
    )
  );

-- =====================================================================
-- STEP 11 — ticket_proposals
-- AI-generated ticket suggestions in staging state before becoming real
-- tickets. Entry point of the hybrid AI + human triage loop.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.ticket_proposals (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_ids         uuid[]      NOT NULL,  -- array of message IDs that triggered this proposal

  -- AI output
  proposed_category   text        NULL,
  proposed_priority   text        NULL,
  proposed_type       text        NULL,
  proposed_sentiment  text        NULL,
  confidence_score    float       NOT NULL CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
  model_version       text        NOT NULL,  -- e.g. 'claude-sonnet-4-6' or internal prompt tag
  raw_llm_output      jsonb       NOT NULL,  -- full AI response, never lose this

  -- Routing decision
  status              text        NOT NULL DEFAULT 'pending',
  -- 'pending' | 'confirmed' | 'rejected' | 'auto_approved'
  reviewed_by         uuid        NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at         timestamptz NULL,
  rejection_reason    text        NULL,

  -- Result
  ticket_id           uuid        NULL REFERENCES public.tickets(id) ON DELETE SET NULL,

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_proposals_conversation_id
  ON public.ticket_proposals(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ticket_proposals_status
  ON public.ticket_proposals(status);
CREATE INDEX IF NOT EXISTS idx_ticket_proposals_confidence_score
  ON public.ticket_proposals(confidence_score);
CREATE INDEX IF NOT EXISTS idx_ticket_proposals_model_version
  ON public.ticket_proposals(model_version);

ALTER TABLE public.ticket_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ticket proposals"
  ON public.ticket_proposals FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = ticket_proposals.conversation_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own ticket proposals"
  ON public.ticket_proposals FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own ticket proposals"
  ON public.ticket_proposals FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = ticket_proposals.conversation_id
        AND c.user_id = auth.uid()
    )
  );

-- =====================================================================
-- STEP 12 — categorization_feedback
-- Reinforcement learning signal store. Append-only event log.
-- One row per proposal outcome. Used to retrain and evaluate the model.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.categorization_feedback (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id           uuid    NOT NULL REFERENCES public.ticket_proposals(id) ON DELETE CASCADE,
  ticket_id             uuid    NULL REFERENCES public.tickets(id) ON DELETE SET NULL,

  -- What the model predicted
  predicted_category    text    NULL,
  predicted_priority    text    NULL,
  predicted_sentiment   text    NULL,
  confidence_score      float   NOT NULL,
  model_version         text    NOT NULL,

  -- What actually happened
  outcome               text    NOT NULL,   -- 'confirmed' | 'rejected' | 'auto'
  final_category        text    NULL,        -- agent correction if rejected
  final_priority        text    NULL,
  final_sentiment       text    NULL,
  is_correction         boolean NOT NULL DEFAULT false,  -- true if agent changed AI's answer

  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categorization_feedback_predicted_category
  ON public.categorization_feedback(predicted_category);
CREATE INDEX IF NOT EXISTS idx_categorization_feedback_outcome
  ON public.categorization_feedback(outcome);
CREATE INDEX IF NOT EXISTS idx_categorization_feedback_model_version
  ON public.categorization_feedback(model_version);
CREATE INDEX IF NOT EXISTS idx_categorization_feedback_is_correction
  ON public.categorization_feedback(is_correction);
CREATE INDEX IF NOT EXISTS idx_categorization_feedback_created_at
  ON public.categorization_feedback(created_at);

ALTER TABLE public.categorization_feedback ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated users; writes go through service role only
CREATE POLICY "Authenticated users can read categorization_feedback"
  ON public.categorization_feedback FOR SELECT
  USING (auth.role() = 'authenticated');

-- =====================================================================
-- STEP 13 — category_confidence_thresholds
-- Controls when AI earns autonomy per category.
-- Updated by a background job recomputing accuracy from feedback.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.category_confidence_thresholds (
  id                    uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  category              text    NOT NULL UNIQUE,
  min_confidence        float   NOT NULL DEFAULT 0.85,
  min_sample_size       int     NOT NULL DEFAULT 50,   -- min confirmations before auto can enable
  current_accuracy      float   NULL,                   -- recomputed by background job
  current_sample_count  int     NOT NULL DEFAULT 0,
  auto_approval_enabled boolean NOT NULL DEFAULT false,
  last_evaluated_at     timestamptz NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.category_confidence_thresholds ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated users; updates only via service role
CREATE POLICY "Authenticated users can read category_confidence_thresholds"
  ON public.category_confidence_thresholds FOR SELECT
  USING (auth.role() = 'authenticated');

DROP TRIGGER IF EXISTS on_category_confidence_thresholds_updated ON public.category_confidence_thresholds;
CREATE TRIGGER on_category_confidence_thresholds_updated
  BEFORE UPDATE ON public.category_confidence_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- =====================================================================
-- STEP 14 — Scheduled accuracy recompute function
-- Call this from pg_cron or a Supabase Edge Function on a schedule.
-- Uses SECURITY DEFINER so it can write to service-role-only tables.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.recompute_category_confidence_thresholds()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.category_confidence_thresholds (
    category,
    min_confidence,
    min_sample_size,
    current_accuracy,
    current_sample_count,
    auto_approval_enabled,
    last_evaluated_at
  )
  SELECT
    cf.predicted_category                                                  AS category,
    0.85                                                                   AS min_confidence,
    50                                                                     AS min_sample_size,
    COUNT(*) FILTER (WHERE cf.outcome IN ('confirmed', 'auto'))::float
      / NULLIF(COUNT(*), 0)                                                AS current_accuracy,
    COUNT(*)                                                               AS current_sample_count,
    false                                                                  AS auto_approval_enabled,
    now()                                                                  AS last_evaluated_at
  FROM public.categorization_feedback cf
  WHERE cf.predicted_category IS NOT NULL
  GROUP BY cf.predicted_category
  ON CONFLICT (category) DO UPDATE SET
    current_accuracy      = EXCLUDED.current_accuracy,
    current_sample_count  = EXCLUDED.current_sample_count,
    -- flip auto_approval_enabled using the stored thresholds, not hardcoded values
    auto_approval_enabled = (
      EXCLUDED.current_sample_count  >= category_confidence_thresholds.min_sample_size
      AND EXCLUDED.current_accuracy  >= category_confidence_thresholds.min_confidence
    ),
    last_evaluated_at     = EXCLUDED.last_evaluated_at,
    updated_at            = now();
END;
$$;

COMMIT;
