import { useEffect, useState } from "react";
import { apiCall } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// KAI-232 — active members of the caller's account, for the @mention dropdown.
//
// Source: GET /api/v1/members (ADR-025 §6). The list is small and stable, so
// it is fetched once per activation and filtered client-side — there is no
// server-side typeahead.
// ---------------------------------------------------------------------------

export interface AccountMember {
  user_id: string;
  name: string | null;
  email: string | null;
  role: string;
}

interface UseAccountMembersResult {
  members: AccountMember[];
  loading: boolean;
}

/**
 * Fetches account members the first time `enabled` turns true, then keeps the
 * cached list for the lifetime of the component.
 */
export function useAccountMembers(enabled: boolean): UseAccountMembersResult {
  const [members, setMembers] = useState<AccountMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || loaded) return;

    let cancelled = false;
    setLoading(true);

    apiCall("/api/v1/members")
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((body: { data?: AccountMember[] }) => {
        if (cancelled) return;
        setMembers(body.data ?? []);
        setLoaded(true);
      })
      .catch(() => {
        // Non-fatal: the composer still works, just without suggestions.
        if (!cancelled) setLoaded(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [enabled, loaded]);

  return { members, loading };
}

/**
 * Members whose name or email matches `query` (case-insensitive), capped at
 * `limit`. An empty query returns the head of the list, so typing a bare "@"
 * still shows suggestions.
 */
export function filterMembers(
  members: AccountMember[],
  query: string,
  limit: number,
  excludeUserId?: string | null,
): AccountMember[] {
  const needle = query.trim().toLowerCase();
  return members
    .filter((m) => m.user_id !== excludeUserId)
    .filter((m) => {
      if (!needle) return true;
      const name = (m.name ?? "").toLowerCase();
      const email = (m.email ?? "").toLowerCase();
      return name.includes(needle) || email.includes(needle);
    })
    .slice(0, limit);
}
