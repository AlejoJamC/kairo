import { createClient } from "@/lib/supabase/client";
import { normalizeEmail, normalizePhone } from "@kairo/identity";

const DEFAULT_COUNTRY = "CO" as const; // TODO: source from accounts.default_country when added

interface TelemetryBase {
  draft_id: string;
}

function telemetry(event: string, payload: TelemetryBase & Record<string, unknown>) {
  // v1: structured log. Future: replace with real analytics sink without changing callers.
  console.info(`[telemetry][${event}]`, JSON.stringify(payload));
}

export async function confirmDraft(draftId: string, firstSeenAtIso: string | null) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("confirm_draft_contact", { p_draft_id: draftId });
  if (error) throw new Error(error.message);
  const time_to_confirm_ms = firstSeenAtIso ? Date.now() - new Date(firstSeenAtIso).getTime() : null;
  telemetry("draft_contact_confirmed", { draft_id: draftId, time_to_confirm_ms });
  return data;
}

export async function rejectDraft(draftId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("reject_draft_contact", { p_draft_id: draftId });
  if (error) throw new Error(error.message);
  telemetry("draft_contact_rejected", { draft_id: draftId });
  return data;
}

export async function unrejectDraft(draftId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("unreject_draft_contact", { p_draft_id: draftId });
  if (error) throw new Error(error.message);
  // No telemetry event in spec for this; emit a generic one for completeness.
  telemetry("draft_contact_unrejected", { draft_id: draftId });
  return data;
}

export interface EditPatch {
  display_name?: string | null;
  email?: string | null;
  phone?: string | null;
  organization?: string | null;
}

export async function editDraft(draftId: string, patch: EditPatch) {
  // Normalize identity fields client-side (RPC trusts the values)
  const normalized: EditPatch = { ...patch };
  if (patch.email !== undefined) {
    normalized.email = patch.email ? normalizeEmail(patch.email) : null;
    if (patch.email && normalized.email === null) {
      throw new Error("invalid_email_format");
    }
  }
  if (patch.phone !== undefined) {
    if (patch.phone) {
      const r = normalizePhone(patch.phone, DEFAULT_COUNTRY);
      if (!r) throw new Error("invalid_phone_format");
      normalized.phone = r.e164;
    } else {
      normalized.phone = null;
    }
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("edit_draft_contact", { p_draft_id: draftId, p_patch: normalized as Record<string, unknown> });
  if (error) {
    // 23505 (duplicate key) → caller should display merge suggestion
    if (error.code === "23505" || /duplicate/i.test(error.message)) {
      throw Object.assign(new Error("merge_candidate"), { code: "merge_candidate" });
    }
    throw new Error(error.message);
  }
  const changed = Object.keys(normalized).filter((k) => normalized[k as keyof EditPatch] !== undefined);
  telemetry("draft_contact_edited", { draft_id: draftId, fields_changed: changed });
  return data;
}

export async function bulkConfirmByOrganization(organization: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("bulk_confirm_drafts_by_organization", { p_organization: organization });
  if (error) throw new Error(error.message);
  telemetry("draft_contact_bulk_confirmed", { draft_id: "(bulk)", organization, count: data });
  return data as number;
}
