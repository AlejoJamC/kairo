-- ─────────────────────────────────────────────────────────────────────────────
-- KAI-228 — Audit log + RPCs for draft_contact actions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE public.draft_contact_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id        uuid NOT NULL REFERENCES public.draft_contact(id) ON DELETE CASCADE,
  account_id      uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  actor_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action          text NOT NULL,
  diff            jsonb,            -- before/after for 'edited'; nullable for others
  created_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT draft_contact_audit_action_check
    CHECK (action IN ('confirmed','rejected','edited','unrejected'))
);

CREATE INDEX idx_draft_contact_audit_draft_created
  ON public.draft_contact_audit_log (draft_id, created_at DESC);

CREATE INDEX idx_draft_contact_audit_account_created
  ON public.draft_contact_audit_log (account_id, created_at DESC);

ALTER TABLE public.draft_contact_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY draft_contact_audit_select ON public.draft_contact_audit_log
  FOR SELECT
  USING (account_id = public.current_account_id());

-- No INSERT/UPDATE/DELETE policies: all writes go through SECURITY DEFINER RPCs.

COMMENT ON TABLE public.draft_contact_audit_log IS
  'Linear audit trail of agent actions on draft_contact rows. KAI-228.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: assert caller is an active member of the draft's account.
-- Used by every RPC. Raises insufficient_privilege on failure.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._assert_draft_access(p_draft_id uuid)
RETURNS TABLE (account_id uuid, draft_status public.draft_contact_status, draft_origin public.draft_contact_origin)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_status     public.draft_contact_status;
  v_origin     public.draft_contact_origin;
BEGIN
  SELECT d.account_id, d.status, d.origin
    INTO v_account_id, v_status, v_origin
  FROM public.draft_contact d
  WHERE d.id = p_draft_id;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'draft not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.account_members am
    WHERE am.account_id = v_account_id
      AND am.user_id = auth.uid()
      AND am.status = 'active'
  ) THEN
    RAISE EXCEPTION 'forbidden: not a member of draft account' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY SELECT v_account_id, v_status, v_origin;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_draft_access(uuid) FROM public;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: confirm_draft_contact
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_draft_contact(p_draft_id uuid)
RETURNS public.draft_contact
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id   uuid;
  v_status       public.draft_contact_status;
  v_origin       public.draft_contact_origin;
  v_updated_row  public.draft_contact;
BEGIN
  SELECT account_id, draft_status, draft_origin
    INTO v_account_id, v_status, v_origin
  FROM public._assert_draft_access(p_draft_id);

  IF v_status <> 'proposed' THEN
    RAISE EXCEPTION 'invalid_state: draft is not proposed (current: %)', v_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.draft_contact
     SET status       = 'confirmed',
         confirmed_at = now(),
         confirmed_by = auth.uid()
   WHERE id = p_draft_id
   RETURNING * INTO v_updated_row;

  INSERT INTO public.draft_contact_audit_log (draft_id, account_id, actor_user_id, action)
  VALUES (p_draft_id, v_account_id, auth.uid(), 'confirmed');

  RETURN v_updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_draft_contact(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: reject_draft_contact
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_draft_contact(p_draft_id uuid)
RETURNS public.draft_contact
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id   uuid;
  v_status       public.draft_contact_status;
  v_origin       public.draft_contact_origin;
  v_updated_row  public.draft_contact;
BEGIN
  SELECT account_id, draft_status, draft_origin
    INTO v_account_id, v_status, v_origin
  FROM public._assert_draft_access(p_draft_id);

  IF v_status <> 'proposed' THEN
    RAISE EXCEPTION 'invalid_state: draft is not proposed (current: %)', v_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.draft_contact
     SET status = 'rejected'
   WHERE id = p_draft_id
   RETURNING * INTO v_updated_row;

  INSERT INTO public.draft_contact_audit_log (draft_id, account_id, actor_user_id, action)
  VALUES (p_draft_id, v_account_id, auth.uid(), 'rejected');

  RETURN v_updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_draft_contact(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: unreject_draft_contact (rejected → proposed)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unreject_draft_contact(p_draft_id uuid)
RETURNS public.draft_contact
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id   uuid;
  v_status       public.draft_contact_status;
  v_origin       public.draft_contact_origin;
  v_updated_row  public.draft_contact;
BEGIN
  SELECT account_id, draft_status, draft_origin
    INTO v_account_id, v_status, v_origin
  FROM public._assert_draft_access(p_draft_id);

  IF v_status <> 'rejected' THEN
    RAISE EXCEPTION 'invalid_state: draft is not rejected (current: %)', v_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.draft_contact
     SET status = 'proposed'
   WHERE id = p_draft_id
   RETURNING * INTO v_updated_row;

  INSERT INTO public.draft_contact_audit_log (draft_id, account_id, actor_user_id, action)
  VALUES (p_draft_id, v_account_id, auth.uid(), 'unrejected');

  RETURN v_updated_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unreject_draft_contact(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: edit_draft_contact (only for proposed kairo_created)
-- p_patch shape: { display_name?, email?, phone?, organization? }
-- Identity normalization (lowercase email, E.164 phone) is the CLIENT's job
-- using @kairo/identity. The RPC just applies the patch and validates that
-- at least one of (email, phone) remains non-null.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.edit_draft_contact(p_draft_id uuid, p_patch jsonb)
RETURNS public.draft_contact
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id    uuid;
  v_status        public.draft_contact_status;
  v_origin        public.draft_contact_origin;
  v_before        public.draft_contact;
  v_after         public.draft_contact;
  v_new_email     text;
  v_new_phone     text;
  v_new_name      text;
  v_new_org       text;
  v_changed_keys  text[] := ARRAY[]::text[];
  v_diff          jsonb := '{}'::jsonb;
BEGIN
  SELECT account_id, draft_status, draft_origin
    INTO v_account_id, v_status, v_origin
  FROM public._assert_draft_access(p_draft_id);

  IF v_status <> 'proposed' THEN
    RAISE EXCEPTION 'invalid_state: only proposed drafts can be edited (current: %)', v_status
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_origin <> 'kairo_created' THEN
    RAISE EXCEPTION 'invalid_state: external_synced drafts have read-only core fields'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_before FROM public.draft_contact WHERE id = p_draft_id;

  v_new_email := COALESCE(NULLIF(p_patch->>'email', ''), v_before.email);
  v_new_phone := COALESCE(NULLIF(p_patch->>'phone', ''), v_before.phone);
  v_new_name  := COALESCE(NULLIF(p_patch->>'display_name', ''), v_before.display_name);
  v_new_org   := COALESCE(NULLIF(p_patch->>'organization', ''), v_before.organization);

  -- Explicit null support: caller can pass JSON null to clear a field
  IF p_patch ? 'email'        AND (p_patch->>'email')        IS NULL THEN v_new_email := NULL; END IF;
  IF p_patch ? 'phone'        AND (p_patch->>'phone')        IS NULL THEN v_new_phone := NULL; END IF;
  IF p_patch ? 'display_name' AND (p_patch->>'display_name') IS NULL THEN v_new_name  := NULL; END IF;
  IF p_patch ? 'organization' AND (p_patch->>'organization') IS NULL THEN v_new_org   := NULL; END IF;

  IF v_new_email IS NULL AND v_new_phone IS NULL THEN
    RAISE EXCEPTION 'invalid_input: draft must have at least an email or a phone'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Build diff jsonb { field: { before, after } } only for changed keys
  IF v_new_email IS DISTINCT FROM v_before.email THEN
    v_diff := v_diff || jsonb_build_object('email', jsonb_build_object('before', v_before.email, 'after', v_new_email));
    v_changed_keys := array_append(v_changed_keys, 'email');
  END IF;
  IF v_new_phone IS DISTINCT FROM v_before.phone THEN
    v_diff := v_diff || jsonb_build_object('phone', jsonb_build_object('before', v_before.phone, 'after', v_new_phone));
    v_changed_keys := array_append(v_changed_keys, 'phone');
  END IF;
  IF v_new_name IS DISTINCT FROM v_before.display_name THEN
    v_diff := v_diff || jsonb_build_object('display_name', jsonb_build_object('before', v_before.display_name, 'after', v_new_name));
    v_changed_keys := array_append(v_changed_keys, 'display_name');
  END IF;
  IF v_new_org IS DISTINCT FROM v_before.organization THEN
    v_diff := v_diff || jsonb_build_object('organization', jsonb_build_object('before', v_before.organization, 'after', v_new_org));
    v_changed_keys := array_append(v_changed_keys, 'organization');
  END IF;

  IF cardinality(v_changed_keys) = 0 THEN
    RETURN v_before; -- no-op
  END IF;

  -- Apply update (unique constraints on (account_id,email) and (account_id,phone) will
  -- raise 23505 if the new identity collides — caller should catch and prompt merge UI)
  UPDATE public.draft_contact
     SET email        = v_new_email,
         phone        = v_new_phone,
         display_name = v_new_name,
         organization = v_new_org
   WHERE id = p_draft_id
   RETURNING * INTO v_after;

  INSERT INTO public.draft_contact_audit_log (draft_id, account_id, actor_user_id, action, diff)
  VALUES (p_draft_id, v_account_id, auth.uid(), 'edited', v_diff || jsonb_build_object('changed_fields', to_jsonb(v_changed_keys)));

  RETURN v_after;
END;
$$;

GRANT EXECUTE ON FUNCTION public.edit_draft_contact(uuid, jsonb) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: bulk_confirm_drafts_by_organization
-- Atomic: all-or-nothing in a single transaction.
-- Returns count of confirmed rows.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_confirm_drafts_by_organization(p_organization text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_account_id uuid;
  v_count      integer;
BEGIN
  v_account_id := public.current_account_id();
  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'forbidden: no active account' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Update proposed drafts matching the org for this account
  WITH updated AS (
    UPDATE public.draft_contact
       SET status       = 'confirmed',
           confirmed_at = now(),
           confirmed_by = auth.uid()
     WHERE account_id   = v_account_id
       AND organization = p_organization
       AND status       = 'proposed'
     RETURNING id
  )
  SELECT count(*) INTO v_count FROM updated;

  -- Audit log rows in the same transaction
  INSERT INTO public.draft_contact_audit_log (draft_id, account_id, actor_user_id, action, diff)
  SELECT d.id, d.account_id, auth.uid(), 'confirmed', jsonb_build_object('bulk_by_organization', p_organization)
  FROM public.draft_contact d
  WHERE d.account_id   = v_account_id
    AND d.organization = p_organization
    AND d.confirmed_at >= now() - interval '5 seconds'
    AND d.confirmed_by = auth.uid();

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_confirm_drafts_by_organization(text) TO authenticated;
