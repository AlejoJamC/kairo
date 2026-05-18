-- ADR-022 Sub-fase 3c: drop user_id from auxiliary tables (idempotent)
-- Tables: clients, conversations, kb_articles, ticket_groups, ticket_followers

-- ─────────────────────────────────────────────────────────────────────────────
-- clients
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_clients_user_id;
DROP INDEX IF EXISTS public.idx_clients_name;
DROP INDEX IF EXISTS public.idx_clients_account_id;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_user_id_internal_id_key;
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_user_id_fkey;
ALTER TABLE public.clients DROP COLUMN IF EXISTS user_id;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_account_id_internal_id_key;
ALTER TABLE public.clients ADD CONSTRAINT clients_account_id_internal_id_key UNIQUE (account_id, internal_id);

CREATE INDEX IF NOT EXISTS idx_clients_account_id ON public.clients (account_id);
CREATE INDEX IF NOT EXISTS idx_clients_name ON public.clients (account_id, name);

-- ─────────────────────────────────────────────────────────────────────────────
-- conversations
-- ─────────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS public.idx_conversations_user_id;
DROP INDEX IF EXISTS public.idx_conversations_account_id;

ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;
ALTER TABLE public.conversations DROP COLUMN IF EXISTS user_id;

CREATE INDEX IF NOT EXISTS idx_conversations_account_id ON public.conversations (account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- kb_articles
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.kb_articles DROP CONSTRAINT IF EXISTS kb_articles_user_id_fkey;
ALTER TABLE public.kb_articles DROP COLUMN IF EXISTS user_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- ticket_groups
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ticket_groups DROP COLUMN IF EXISTS user_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- ticket_followers: validate membership, keep FK to auth.users
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ticket_followers DROP CONSTRAINT IF EXISTS ticket_followers_user_id_fkey;

DELETE FROM public.ticket_followers tf
WHERE NOT EXISTS (
  SELECT 1
  FROM public.account_members am
  JOIN public.tickets t ON t.id = tf.ticket_id
  WHERE am.user_id    = tf.user_id
    AND am.account_id = t.account_id
    AND am.status     = 'active'
);

ALTER TABLE public.ticket_followers
  ADD CONSTRAINT ticket_followers_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
