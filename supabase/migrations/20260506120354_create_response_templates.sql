-- KAI-30: response_templates — tenant-scoped reply templates
-- Soft-delete via is_active. Locale stored per template to support
-- tenants seeding defaults in both ES and EN.

CREATE TABLE IF NOT EXISTS public.response_templates (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  content    TEXT        NOT NULL,
  category   TEXT        NULL,
  locale     TEXT        NOT NULL DEFAULT 'es',
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_response_templates_user_id
  ON public.response_templates(user_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_response_templates_locale
  ON public.response_templates(user_id, locale)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS on_response_templates_updated ON public.response_templates;
CREATE TRIGGER on_response_templates_updated
  BEFORE UPDATE ON public.response_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.response_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own templates"
  ON public.response_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own templates"
  ON public.response_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON public.response_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON public.response_templates FOR DELETE
  USING (auth.uid() = user_id);
