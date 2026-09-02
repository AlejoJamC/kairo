-- KAI-93 / ADR-027 — the permission to auto-approve a classification.
--
-- `category_confidence_thresholds` was built for the wrong field and fed from a
-- table nobody writes:
--
--   * its `category` came from categorization_feedback.predicted_category —
--     the technical/billing/account/general axis — while what governs whether a
--     classification stands on its own is `ticket_type`. The UI calls the
--     ticket type a "category"; the database took that literally.
--   * categorization_feedback has never had a row written to it, so
--     recompute_category_confidence_thresholds() always grouped over nothing:
--     current_accuracy NULL, sample count 0, auto_approval_enabled never
--     flipping. The mechanism was complete and its input did not exist.
--   * it was UNIQUE (category) with no account_id, so one row governed every
--     tenant. A per-account calibration slider cannot sit on that.
--
-- Nothing read it and nothing wrote it, so it is replaced rather than migrated.

DROP FUNCTION IF EXISTS public.recompute_category_confidence_thresholds();
DROP TABLE IF EXISTS public.category_confidence_thresholds;

CREATE TABLE IF NOT EXISTS public.ticket_type_auto_approval (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id             uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
    ticket_type            text NOT NULL,

    -- What the tenant asks for. The slider in triage settings writes this.
    min_precision          double precision NOT NULL DEFAULT 0.90,
    min_sample_size        integer NOT NULL DEFAULT 30,

    -- What has actually been observed for this account and this class.
    current_precision      double precision,
    current_sample_count   integer NOT NULL DEFAULT 0,

    -- Never set by hand: it is the conjunction of the two pairs above.
    auto_approval_enabled  boolean NOT NULL DEFAULT false,
    last_evaluated_at      timestamptz,

    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT chk_tta_ticket_type CHECK (
      ticket_type = ANY (ARRAY['support','prospect','spam','internal','other'])),
    CONSTRAINT chk_tta_min_precision CHECK (min_precision >= 0.5 AND min_precision <= 1.0),
    CONSTRAINT chk_tta_min_sample CHECK (min_sample_size > 0)
);

ALTER TABLE public.ticket_type_auto_approval
  ADD CONSTRAINT ticket_type_auto_approval_account_type_key UNIQUE (account_id, ticket_type);

CREATE TRIGGER on_ticket_type_auto_approval_updated
  BEFORE UPDATE ON public.ticket_type_auto_approval
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.ticket_type_auto_approval ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read their account's thresholds"
  ON public.ticket_type_auto_approval FOR SELECT
  USING (account_id IN (
    SELECT am.account_id FROM public.account_members am
    WHERE am.user_id = auth.uid() AND am.status = 'active'));

COMMENT ON TABLE public.ticket_type_auto_approval IS
  'Per-account, per-ticket_type permission to let a classification stand without '
  'human review. Earned from measured precision over a minimum sample, never set '
  'by hand — see ADR-027. The 0.90 default is where all five bench models land on '
  '`support`; 30 is the sample below which a perfect run says nothing (granite '
  'scored 100% on 4 predictions of `internal`).';

COMMENT ON COLUMN public.ticket_type_auto_approval.min_precision IS
  'Precision the class must reach before it auto-approves. Precision of the '
  'PREDICTION, not the confidence the model reports about itself — that number '
  'was measured and does not separate right from wrong (ADR-027).';
