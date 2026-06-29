/**
 * Transactional email URL resolution — KAI-245 / ADR-024 §5
 *
 * Single place that resolves the footer URLs consumed by the registry
 * (`apps/api/src/emails/registry.ts`):
 *
 *  - `help_center_url`, `status_url`, `unsubscribe_url`: per-tenant override
 *    via `accounts` columns. No platform fallback exists yet (no help
 *    center / status page / unsubscribe flow) — `""` when unset, which the
 *    registry's `kairo:if` blocks turn into a hidden footer link.
 *  - `privacy_url`: per-tenant override via `accounts.privacy_url`, falling
 *    back to the platform-wide `PRIVACY_URL` env (Kairo's own privacy page).
 *
 * `csat_url` / `reopen_url` are intentionally NOT resolved here — no capture
 * or reopen endpoint exists yet (separate future story). Callers pass `""`
 * and the registry hides those CTA blocks.
 *
 * KAI-248 (Grupo 3): the `ticket_url` mailto CTA was removed from every
 * template — the "Responde directamente a este correo" block now drives the
 * native Gmail threading instead, so there is nothing to resolve here.
 */

import { supabase } from "../lib/supabase.js";
import { env } from "../env.js";

export interface EmailUrlContext {
  accountId: string;
}

export interface ResolvedEmailUrls {
  help_center_url: string;
  status_url: string;
  privacy_url: string;
  unsubscribe_url: string;
}

export async function resolveEmailUrls(ctx: EmailUrlContext): Promise<ResolvedEmailUrls> {
  const { data: account } = await supabase
    .from("accounts")
    .select("help_center_url, status_url, privacy_url, unsubscribe_url")
    .eq("id", ctx.accountId)
    .single();

  return {
    help_center_url: account?.help_center_url ?? "",
    status_url: account?.status_url ?? "",
    privacy_url: account?.privacy_url ?? env.PRIVACY_URL,
    unsubscribe_url: account?.unsubscribe_url ?? "",
  };
}
