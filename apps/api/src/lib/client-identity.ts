import type { SupabaseClient } from '@supabase/supabase-js';
import { GENERIC_EMAIL_PROVIDERS, inferOrganizationFromEmail, normalizeEmail } from '@kairo/identity';

/**
 * How the sender relates to the client directory.
 * - `authorized`: the address is listed in exactly one client's authorized_emails (verified).
 * - `ambiguous`: listed by more than one client; no client is chosen.
 * - `same_domain`: not listed, but shares a corporate domain with exactly one client (declared, not verified).
 * - `unknown`: no relation found.
 */
export type SenderAuthority = 'authorized' | 'ambiguous' | 'same_domain' | 'unknown';

export interface DirectoryClient {
  id: string;
  plan_type: string | null;
  sla_level: string | null;
  authorized_emails: string[] | null;
}

/** A row of the contact pipeline (draft_contact): a person seen in the mail, proposed or confirmed by a human. */
export interface DirectoryContact {
  id: string;
  email: string | null;
  display_name: string | null;
  organization: string | null;
  status: 'proposed' | 'confirmed' | 'rejected';
}

export interface SenderIdentity {
  /** Set only for a verified (`authorized`) sender: it drives contractual SLA. */
  clientId: string | null;
  authority: SenderAuthority;
  /** The client a `same_domain` sender probably belongs to; never used to apply a contract. */
  candidateClientId: string | null;
  /**
   * Who wrote, always present when the address is valid, even with no record
   * anywhere: the potential client the conversation is with.
   */
  sender: { email: string; displayName: string | null; organization: string | null } | null;
  /**
   * The sender in the contact pipeline. A confirmed contact is a person a human
   * verified; it carries no client or contract until contacts are linked to clients.
   */
  contact: { id: string; status: 'proposed' | 'confirmed'; organization: string | null } | null;
}

const domainOf = (email: string) => email.slice(email.lastIndexOf('@') + 1);

export function identifySender(
  sender: string | null | undefined,
  clients: DirectoryClient[],
  contacts: DirectoryContact[] = [],
  displayName: string | null = null,
): SenderIdentity {
  const email = normalizeEmail(sender);
  if (!email) return { clientId: null, authority: 'unknown', candidateClientId: null, sender: null, contact: null };

  const known = contacts.find(row => row.status !== 'rejected' && normalizeEmail(row.email) === email);
  const contact = known && known.status !== 'rejected' ? { id: known.id, status: known.status, organization: known.organization } : null;
  const identified = {
    sender: { email, displayName: known?.display_name ?? displayName, organization: known?.organization ?? inferOrganizationFromEmail(email) },
    contact,
  };

  const listed = clients.filter(client => (client.authorized_emails ?? []).some(address => normalizeEmail(address) === email));
  if (listed.length === 1) return { clientId: listed[0]!.id, authority: 'authorized', candidateClientId: null, ...identified };
  if (listed.length > 1) return { clientId: null, authority: 'ambiguous', candidateClientId: null, ...identified };
  const domain = domainOf(email);
  // A free mail provider says nothing about which company the sender works for.
  if (GENERIC_EMAIL_PROVIDERS.has(domain)) return { clientId: null, authority: 'unknown', candidateClientId: null, ...identified };
  const sameDomain = clients.filter(client => (client.authorized_emails ?? []).some(address => {
    const normalized = normalizeEmail(address);
    return normalized !== null && domainOf(normalized) === domain;
  }));
  return sameDomain.length === 1
    ? { clientId: null, authority: 'same_domain', candidateClientId: sameDomain[0]!.id, ...identified }
    : { clientId: null, authority: 'unknown', candidateClientId: null, ...identified };
}

/**
 * Reads the account's client directory, and the sender's row in the contact
 * pipeline when `contacts` is requested, and identifies the sender.
 */
export async function resolveSenderIdentity(
  db: SupabaseClient, accountId: string, sender: string | null | undefined,
  options: { contacts?: boolean; displayName?: string | null } = {},
): Promise<{ identity: SenderIdentity; client: DirectoryClient | null }> {
  const email = normalizeEmail(sender);
  const [clientRows, contactRows] = await Promise.all([
    db.from('clients').select('id,plan_type,sla_level,authorized_emails').eq('account_id', accountId),
    options.contacts && email
      ? db.from('draft_contact').select('id,email,display_name,organization,status')
        .eq('account_id', accountId).eq('email', email).is('merged_into_id', null).neq('status', 'rejected')
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (clientRows.error) throw new Error('Client directory unavailable');
  if (contactRows.error) throw new Error('Contact directory unavailable');
  const clients = (clientRows.data ?? []) as DirectoryClient[];
  const identity = identifySender(sender, clients, (contactRows.data ?? []) as DirectoryContact[], options.displayName ?? null);
  return { identity, client: clients.find(client => client.id === identity.clientId) ?? null };
}
