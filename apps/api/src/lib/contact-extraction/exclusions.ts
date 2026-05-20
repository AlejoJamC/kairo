import type { Candidate } from './types.js';

/**
 * Context required to filter candidates.
 */
export interface FilterContext {
  /**
   * Set of email addresses that belong to the tenant's own channels
   * (from `channel_integrations.display_name` filtered by account_id).
   *
   * These are internal emails — contacts sent FROM this email are not customers,
   * they are the tenant itself.
   */
  tenantInternalEmails: Set<string>;
}

/**
 * Rule 1: Match against well-known noreply / bot local-part patterns.
 *
 * Matches the full address against patterns like:
 *   no-reply@..., noreply@..., bounces@..., postmaster@...,
 *   mailer-daemon@..., notifications@..., donotreply@...
 *
 * The regex tests the **local-part** (before @) so it won't accidentally
 * match company names that contain these substrings in the domain.
 */
const BOT_ADDRESS_REGEX = /^(no-?reply|bounces?|postmaster|mailer-?daemon|notifications?|donotreply|support-noreply)@/i;

/**
 * Rule 1b: Emails whose local-part *contains* "noreply" or "no-reply"
 * (e.g., `orders+noreply@store.com`) are also excluded.
 */
const BOT_LOCAL_PART_CONTAINS_REGEX = /no-?reply/i;

function isBotEmail(email: string): boolean {
  if (BOT_ADDRESS_REGEX.test(email)) return true;
  const localPart = email.split('@')[0] ?? '';
  return BOT_LOCAL_PART_CONTAINS_REGEX.test(localPart);
}

/**
 * Filters a list of candidates by applying three exclusion rules.
 *
 * Rule 1 — Noreply / bot emails:
 *   Emails matching common automated sender patterns are excluded.
 *   These will never be real contacts.
 *
 * Rule 2 — Tenant internal emails:
 *   Candidates whose email is in `ctx.tenantInternalEmails` are excluded.
 *   These are the tenant's own email channels — not external customers.
 *
 * Rule 3 — Mass CC exclusion:
 *   A candidate that:
 *   (a) only appears in CC role (never as sender or recipient),
 *   (b) was part of a message with more than 10 total addressees in the CC
 *       (approximated by checking if the candidate's source is 'cc_header' and
 *        the message CC count exceeds the threshold), AND
 *   (c) does not appear as sender/recipient in any other message,
 *   is considered a mailing list or mass-CC recipient and excluded.
 *
 * Note: Rule 3 requires aggregated CC-count context. In Pasada A the candidates
 * are already deduped by email, so we check their evidence_role: only `cc`-only
 * candidates from messages with >10 CC addresses are excluded.
 *
 * @param candidates   - Raw candidates from `extractCandidatesHeuristic`.
 * @param ctx          - Tenant context (internal emails, etc.).
 * @param ccCountByEmail - Optional map from email → number of co-recipients in
 *   the CC line. When provided, enables Rule 3. Build it in the worker step.
 */
export function filterCandidates(
  candidates: Candidate[],
  ctx: FilterContext,
  ccCountByEmail?: Map<string, number>,
): Candidate[] {
  const MASS_CC_THRESHOLD = 10;

  return candidates.filter((c) => {
    if (!c.email) return false;

    // Rule 1: Bot / noreply patterns
    if (isBotEmail(c.email)) {
      return false;
    }

    // Rule 2: Tenant internal emails
    if (ctx.tenantInternalEmails.has(c.email)) {
      return false;
    }

    // Rule 3: Mass CC exclusion
    // Only applies to candidates that solely appeared in CC role
    if (
      c.evidence_role === 'cc' &&
      ccCountByEmail &&
      (ccCountByEmail.get(c.email) ?? 0) > MASS_CC_THRESHOLD
    ) {
      return false;
    }

    return true;
  });
}
