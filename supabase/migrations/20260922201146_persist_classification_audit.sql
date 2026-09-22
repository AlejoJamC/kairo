-- KAI-45 F5 — every decision is stored with what produced it.
--
-- A `ticket_type` is now the product of three coordinates: provenance, read off
-- the envelope, and two axes the model answers, looked up in a versioned table.
-- Stored as the bare type, a row from last week and a corpus run from today
-- that disagree are indistinguishable from a model that changed its mind, and a
-- correction cannot be traced back to the layer that got it wrong. These
-- columns make every stored decision readable against its inputs.
--
-- Each column sits beside the value it explains:
--
--   messages          the routing decision is made per message, including the
--                     ones that never become a ticket — which is exactly the
--                     population nothing could audit before.
--   tickets           `ticket_type` lives here, and the reclassify paths
--                     overwrite it here without creating a proposal, so the
--                     table and rubric that produced it have to be here too.
--   classification_feedback
--                     copied at correction time, the same pattern the
--                     existing `ai_*` columns already follow: a later
--                     reclassification must not rewrite what a correction was
--                     made against.
--
-- All nullable. Rows written before this migration carry no audit, and that is
-- the truth about them; a default would claim a version that did not produce
-- them. `abstain` is the exception: false is correct for every existing row,
-- since no ensemble existed.

alter table "public"."messages"
  add column if not exists "mail_facts" "jsonb",
  add column if not exists "routing_policy_version" "text";

comment on column "public"."messages"."mail_facts" is
  'MailFacts computed from the envelope before routing (apps/api/src/lib/email/mail-facts.ts). Facts, never a judgement.';
comment on column "public"."messages"."routing_policy_version" is
  'ROUTING_POLICY_VERSION that decided this message''s route. Scheme in docs/versioning.md.';

alter table "public"."tickets"
  add column if not exists "model_verdict" "jsonb",
  add column if not exists "derivation_version" "text",
  add column if not exists "prompt_version" "text",
  add column if not exists "abstain" boolean not null default false;

comment on column "public"."tickets"."model_verdict" is
  'What the model answered for the current classification — the two axes and the other fields, before the derivation table — plus the ensemble''s second answer when one ran.';
comment on column "public"."tickets"."derivation_version" is
  'DERIVATION_VERSION of the table that turned provenance and the axes into ticket_type.';
comment on column "public"."tickets"."prompt_version" is
  'Rubric version the current classification was made with.';
comment on column "public"."tickets"."abstain" is
  'The classification ensemble disagreed on the type. Such a ticket is never auto-approved.';

alter table "public"."classification_feedback"
  add column if not exists "ai_mail_facts" "jsonb",
  add column if not exists "ai_model_verdict" "jsonb",
  add column if not exists "ai_routing_policy_version" "text",
  add column if not exists "ai_derivation_version" "text",
  add column if not exists "ai_prompt_version" "text";
