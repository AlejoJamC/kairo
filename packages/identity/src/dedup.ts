import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@kairo/types';

/** A row from the `draft_contact` table. */
export type DraftContact = Tables<'draft_contact'>;

/**
 * A candidate returned by `findExistingDraft`.
 * Wraps the matched draft with a note about which field matched.
 */
export interface DedupCandidate {
  draft: DraftContact;
  matchedOn: 'email' | 'phone';
}

/**
 * A candidate returned by `detectWeakMatches`.
 * The match is approximate (ILIKE), so confidence is intentionally absent here —
 * it is up to the caller to rank or score results.
 */
export interface WeakMatchCandidate {
  draft: DraftContact;
  matchedOn: 'display_name' | 'organization';
}

type DbClient = SupabaseClient<Database>;

/**
 * Looks for an existing `draft_contact` row that matches the given email and/or
 * phone within the specified account.
 *
 * Resolution order:
 * 1. Try email match (exact, case-sensitive — emails are stored already normalized).
 * 2. If no email match, try phone match.
 * 3. If both match but point to **different** drafts, returns the email-matched
 *    draft and emits a `console.warn` merge-candidate signal. Never auto-merges.
 *
 * @param client   - Supabase client with appropriate RLS permissions.
 * @param accountId - Tenant account ID (never inferred from JWT).
 * @param identifiers - At least one of `email` or `phone` must be provided.
 *
 * @example
 * const draft = await findExistingDraft(client, accountId, { email: 'j@example.com' });
 */
export async function findExistingDraft(
  client: DbClient,
  accountId: string,
  identifiers: { email?: string; phone?: string },
): Promise<DraftContact | null> {
  const { email, phone } = identifiers;

  let emailDraft: DraftContact | null = null;
  let phoneDraft: DraftContact | null = null;

  if (email) {
    const { data, error } = await client
      .from('draft_contact')
      .select('*')
      .eq('account_id', accountId)
      .eq('email', email)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[identity] findExistingDraft: email query error', error);
    } else {
      emailDraft = data;
    }
  }

  if (phone) {
    const { data, error } = await client
      .from('draft_contact')
      .select('*')
      .eq('account_id', accountId)
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();

    if (error) {
      console.warn('[identity] findExistingDraft: phone query error', error);
    } else {
      phoneDraft = data;
    }
  }

  // Both matched but different records → merge candidate signal, return email match.
  if (emailDraft && phoneDraft && emailDraft.id !== phoneDraft.id) {
    console.warn(
      '[identity] findExistingDraft: MERGE_CANDIDATE — email matches draft %s but phone matches draft %s. Returning email match. Inspect manually.',
      emailDraft.id,
      phoneDraft.id,
    );
    return emailDraft;
  }

  return emailDraft ?? phoneDraft ?? null;
}

/**
 * Returns up to 10 `draft_contact` rows that loosely match the given
 * `displayName` or `organization` strings using `ILIKE` queries.
 *
 * TODO: Migrate to trigram similarity (`pg_trgm` `%` operator or `similarity()`)
 * once `pg_trgm` extension is enabled in the database. The current ILIKE approach
 * is a placeholder — it works for small datasets but does not scale and has lower
 * recall than trigram matching.
 *
 * @param client     - Supabase client.
 * @param accountId  - Tenant account ID.
 * @param hints      - At least one of `displayName` or `organization` should be provided.
 *
 * @example
 * const matches = await detectWeakMatches(client, accountId, { displayName: 'Johan' });
 */
export async function detectWeakMatches(
  client: DbClient,
  accountId: string,
  hints: { displayName?: string; organization?: string },
): Promise<DraftContact[]> {
  const { displayName, organization } = hints;

  const results = new Map<string, DraftContact>();

  if (displayName) {
    const { data, error } = await client
      .from('draft_contact')
      .select('*')
      .eq('account_id', accountId)
      .ilike('display_name', `%${displayName}%`)
      .limit(10);

    if (error) {
      console.warn('[identity] detectWeakMatches: display_name query error', error);
    } else if (data) {
      for (const row of data) results.set(row.id, row);
    }
  }

  if (organization && results.size < 10) {
    const remaining = 10 - results.size;
    const { data, error } = await client
      .from('draft_contact')
      .select('*')
      .eq('account_id', accountId)
      .ilike('organization', `%${organization}%`)
      .limit(remaining);

    if (error) {
      console.warn('[identity] detectWeakMatches: organization query error', error);
    } else if (data) {
      for (const row of data) {
        if (!results.has(row.id)) results.set(row.id, row);
      }
    }
  }

  return Array.from(results.values()).slice(0, 10);
}
