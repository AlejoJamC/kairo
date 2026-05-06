-- KAI-31: extend ticket_proposals to store AI-suggested replies.
-- proposed_reply holds the draft text Claude generated.
-- referenced_kb_articles stores KB article IDs used as context (empty until
-- kb_articles table and find_relevant_kb RPC are implemented).

ALTER TABLE public.ticket_proposals
  ADD COLUMN IF NOT EXISTS proposed_reply TEXT,
  ADD COLUMN IF NOT EXISTS referenced_kb_articles UUID[] NOT NULL DEFAULT '{}';
