import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { mapDraftContactToRow, type ContactRow } from "@/types/contact-row";
import type { Database } from "@/types/supabase";

// ---------------------------------------------------------------------------
// useDraftContacts — polling hook for draft_contact rows (KAI-227)
// Reusar el patrón resiliente de useClassificationProgress:
//   - Pausa cuando document.hidden
//   - Cancela al desmontar
//   - MAX_CONSECUTIVE_FAILS = 3 antes de mostrar error
// ---------------------------------------------------------------------------

type DraftContactRow = Database["public"]["Tables"]["draft_contact"]["Row"];

const POLL_INTERVAL_MS = 10_000;
const MAX_CONSECUTIVE_FAILS = 3;

interface UseDraftContactsResult {
  drafts: ContactRow[];
  error: string | null;
  loading: boolean;
  retry: () => void;
}

export function useDraftContacts(accountId: string | null): UseDraftContactsResult {
  const [drafts, setDrafts]     = useState<ContactRow[]>([]);
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  const stoppedRef   = useRef(false);
  const timerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failCountRef = useRef(0);

  const retry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRetryKey((k) => k + 1);
  }, []);

  useEffect(() => {
    stoppedRef.current   = false;
    failCountRef.current = 0;

    const poll = async () => {
      if (stoppedRef.current) return;

      try {
        const supabase = createClient();
        let query = supabase
          .from("draft_contact")
          .select(
            "id, email, phone, display_name, organization, status, evidence_count, last_seen_at, origin, external_source, account_id, confidence, confirmed_at, confirmed_by, metadata, created_at, updated_at, external_ref, source_tickets, merged_into_id, first_seen_at"
          )
          // Exclude merged_into — they are canonical-merged and shouldn't appear
          .neq("status", "merged_into")
          .order("evidence_count", { ascending: false })
          .order("last_seen_at", { ascending: false })
          .limit(50);

        if (accountId) {
          query = query.eq("account_id", accountId);
        }

        const { data, error: sbError } = await query;

        if (sbError) throw new Error(sbError.message);

        failCountRef.current = 0; // reset on success
        setError(null);
        setLoading(false);
        setDrafts((data as DraftContactRow[]).map(mapDraftContactToRow));
      } catch (err: unknown) {
        failCountRef.current += 1;
        if (failCountRef.current < MAX_CONSECUTIVE_FAILS) {
          // Transient — keep polling silently
          if (!stoppedRef.current) {
            timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          }
          return;
        }
        // Exceeded threshold
        stoppedRef.current = true;
        setLoading(false);
        setError(err instanceof Error ? err.message : "fetch_error");
        return;
      }

      if (!stoppedRef.current) {
        timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        clearTimeout(timerRef.current!);
      } else if (!stoppedRef.current) {
        poll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    poll();

    return () => {
      stoppedRef.current = true;
      clearTimeout(timerRef.current!);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [accountId, retryKey]);

  return { drafts, error, loading, retry };
}
