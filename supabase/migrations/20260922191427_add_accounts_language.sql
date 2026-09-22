-- KAI-45 F4 — the rubric language, per tenant.
--
-- `DEFAULT_LANG` has been a module constant in the intelligence package since
-- the prompt was forked into es.md and en.md, and no call site has ever passed
-- `lang`. An international customer would have received the Spanish rubric on
-- day one, silently, because there was nowhere to say otherwise.
--
-- Constrained to the languages that actually have a rubric file. `PromptLang`
-- also declares 'pt', but no prompts/email-classification/pt.md exists, so a
-- row set to it would fail at template load — far from here and long after the
-- write that caused it.
alter table "public"."accounts"
  add column if not exists "language" "text" not null default 'es';

alter table "public"."accounts"
  drop constraint if exists "chk_accounts_language";

alter table "public"."accounts"
  add constraint "chk_accounts_language"
  check ("language" = any (array['es'::"text", 'en'::"text"]));

comment on column "public"."accounts"."language" is
  'Rubric language for this tenant. Must match a file in packages/intelligence/prompts/email-classification/ and a member of SUPPORTED_LANGS.';
