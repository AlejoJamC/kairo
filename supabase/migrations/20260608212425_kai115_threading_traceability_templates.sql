-- KAI-115: Threading, ticket traceability, and Templates 2.0
-- ADR-023 §3-§4

-- ============================================================
-- A. Threading: store RFC 2822 Message-ID for inbound messages
-- so the reply endpoint can set correct In-Reply-To / References
-- ============================================================
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_id_header text;

COMMENT ON COLUMN public.messages.message_id_header IS
  'RFC 2822 Message-ID header value (e.g. <abc@mail.gmail.com>) stored for inbound messages; used as In-Reply-To / References in outbound sends (KAI-115)';

-- ============================================================
-- B. Traceability: stable short_id token [KAIRO-<shortid>]
-- ============================================================
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS short_id text GENERATED ALWAYS AS (substring(id::text, 1, 8)) STORED;

CREATE INDEX IF NOT EXISTS tickets_account_short_id_idx
  ON public.tickets (account_id, short_id);

COMMENT ON COLUMN public.tickets.short_id IS
  'First 8 hex chars of ticket UUID used as stable token [KAIRO-<shortid>] in outbound email subject/footer for broken-thread re-association (KAI-115)';

-- ============================================================
-- C. Templates 2.0: signature + branding on accounts
-- ============================================================
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS signature_plain text,
  ADD COLUMN IF NOT EXISTS signature_html  text,
  ADD COLUMN IF NOT EXISTS brand_color     text DEFAULT '#5c6bc0';

COMMENT ON COLUMN public.accounts.signature_plain IS
  'Agent email signature (plain text) appended to all outbound messages (KAI-115)';
COMMENT ON COLUMN public.accounts.signature_html IS
  'Agent email signature (HTML) used inside the HTML email wrapper (KAI-115)';
COMMENT ON COLUMN public.accounts.brand_color IS
  'Primary brand color (hex e.g. #5c6bc0) for HTML email wrapper header (KAI-115)';

-- Optional HTML content column on templates (null = auto-derive from content)
ALTER TABLE public.response_templates
  ADD COLUMN IF NOT EXISTS content_html text;

COMMENT ON COLUMN public.response_templates.content_html IS
  'HTML version of template content (optional; derived from content if null) (KAI-115)';
