import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeEmail } from '@kairo/identity';
import { filterCandidates } from './exclusions.js';
import type { Candidate } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

/**
 * Applies the exclusion rules to the candidates of one ticket using the
 * account's own data: its channel addresses (internal) and the emails
 * registered on its clients (`clients.authorized_emails`).
 */
export async function filterCandidatesForAccount(
  client: DbClient,
  accountId: string,
  candidates: Candidate[],
): Promise<Candidate[]> {
  const { data: channelRows, error: channelsErr } = await client
    .from('channel_integrations')
    .select('display_name')
    .eq('account_id', accountId);
  if (channelsErr) throw new Error(`[contact-extraction] channels lookup failed: ${channelsErr.message}`);

  const tenantInternalEmails = new Set<string>(
    (channelRows ?? [])
      .map((r: { display_name: string | null }) => (r.display_name ?? '').toLowerCase().trim())
      .filter(Boolean),
  );

  const { data: clientRows, error: clientsErr } = await client
    .from('clients')
    .select('authorized_emails')
    .eq('account_id', accountId);
  if (clientsErr) throw new Error(`[contact-extraction] clients lookup failed: ${clientsErr.message}`);

  const clientEmails = new Set<string>();
  for (const row of (clientRows ?? []) as { authorized_emails: string[] | null }[]) {
    for (const address of row.authorized_emails ?? []) {
      const normalized = normalizeEmail(address);
      if (normalized) clientEmails.add(normalized);
    }
  }

  // Rule 4 input: how many times each CC address appears as cc-only evidence.
  const ccCountByEmail = new Map<string, number>();
  for (const c of candidates) {
    if (c.evidence_role === 'cc' && c.email) {
      ccCountByEmail.set(c.email, (ccCountByEmail.get(c.email) ?? 0) + 1);
    }
  }

  return filterCandidates(candidates, { tenantInternalEmails, clientEmails }, ccCountByEmail);
}
