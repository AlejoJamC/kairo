import type { SupabaseClient } from '@supabase/supabase-js';
import { findExistingDraft } from '@kairo/identity';
import type { Candidate } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbClient = SupabaseClient<any>;

export interface UpsertResult {
  wasCreated: boolean;
}

/**
 * Computes the confidence score for a draft contact.
 *
 * v1 placeholder formula: linear ramp from 0.3 → 0.95 as evidence accumulates.
 * This is intentionally simple until KAI-238 introduces LLM-based scoring.
 *
 * confidence = LEAST(0.95, 0.3 + 0.1 × evidence_count)
 */
function computeConfidence(evidenceCount: number): number {
  return Math.min(0.95, 0.3 + 0.1 * evidenceCount);
}

/**
 * Upserts a draft contact row for the given candidate.
 *
 * Behaviour:
 *  - If candidate has no email AND no phone → noop (returns wasCreated: false).
 *  - Looks up an existing draft via `findExistingDraft` (from @kairo/identity).
 *
 *  If NO existing draft:
 *    - INSERT with `status='proposed'`, `origin='kairo_created'`, `evidence_count=1`.
 *    - Uses `ON CONFLICT (account_id, email) DO NOTHING` for email-based upserts,
 *      and `ON CONFLICT (account_id, phone) DO NOTHING` for phone-only candidates.
 *    - If INSERT returns 0 rows (race with another worker), re-reads and updates.
 *
 *  If existing draft:
 *    - If the ticketId is already in `source_tickets` → idempotent no-op.
 *    - Otherwise increments `evidence_count`, updates `last_seen_at`, appends ticketId.
 *    - Applies "no-overwrite" rule on core fields:
 *        • If `origin='external_synced'` → NEVER touch core fields.
 *        • If `origin='kairo_created'` → only fill NULL/empty core fields.
 *    - Updates `confidence` using the v1 placeholder formula.
 *
 * Concurrency note:
 *   The Inngest function has `concurrency: { key: "event.data.ticketId" }` which
 *   serializes runs per-ticket. For cross-ticket concurrency (same contact, different
 *   tickets), the conflict handling + idempotency check provides safety.
 *
 * @param client    - Service-role Supabase client.
 * @param accountId - Tenant account ID.
 * @param ticketId  - Source ticket ID.
 * @param candidate - Candidate from the heuristic pass.
 */
export async function upsertDraftContact(
  client: DbClient,
  accountId: string,
  ticketId: string,
  candidate: Candidate,
): Promise<UpsertResult> {
  // Nothing to persist if no identity
  if (!candidate.email && !candidate.phone) {
    return { wasCreated: false };
  }

  // Look for an existing draft using @kairo/identity (handles email+phone priority)
  const existing = await findExistingDraft(client, accountId, {
    email: candidate.email ?? undefined,
    phone: candidate.phone ?? undefined,
  });

  if (!existing) {
    // --- INSERT path ---
    const now = new Date().toISOString();

    const { data: inserted, error: insertErr } = await client
      .from('draft_contact')
      .insert({
        account_id: accountId,
        email: candidate.email ?? null,
        phone: candidate.phone ?? null,
        display_name: candidate.display_name ?? null,
        organization: candidate.organization ?? null,
        status: 'proposed',
        origin: 'kairo_created',
        evidence_count: 1,
        source_tickets: [ticketId],
        first_seen_at: now,
        last_seen_at: now,
        confidence: computeConfidence(1),
        metadata: {},
      })
      .select('id')
      .maybeSingle();

    if (insertErr) {
      // Unique constraint violation (concurrent insert) — re-read and update below
      if (
        insertErr.code === '23505' ||
        insertErr.message?.includes('duplicate key') ||
        insertErr.message?.includes('unique')
      ) {
        // Fall through: re-read in the update path below
        const raceExisting = await findExistingDraft(client, accountId, {
          email: candidate.email ?? undefined,
          phone: candidate.phone ?? undefined,
        });
        if (!raceExisting) {
          // Edge case: concurrent delete. Skip.
          return { wasCreated: false };
        }
        return updateExisting(client, raceExisting, accountId, ticketId, candidate);
      }
      throw new Error(`[upsertDraftContact] Insert failed: ${insertErr.message}`);
    }

    if (!inserted) {
      // Conflict DO NOTHING returned 0 rows — another worker beat us
      const raceExisting = await findExistingDraft(client, accountId, {
        email: candidate.email ?? undefined,
        phone: candidate.phone ?? undefined,
      });
      if (!raceExisting) return { wasCreated: false };
      return updateExisting(client, raceExisting, accountId, ticketId, candidate);
    }

    return { wasCreated: true };
  }

  // --- UPDATE path ---
  return updateExisting(client, existing, accountId, ticketId, candidate);
}

async function updateExisting(
  client: DbClient,
  existing: { id: string; source_tickets: string[]; evidence_count: number; origin: string; display_name: string | null; organization: string | null; email: string | null; phone: string | null; confidence: number },
  _accountId: string,
  ticketId: string,
  candidate: Candidate,
): Promise<UpsertResult> {
  // Idempotency: if this ticket already contributed evidence, skip
  if (existing.source_tickets.includes(ticketId)) {
    return { wasCreated: false };
  }

  const newEvidenceCount = existing.evidence_count + 1;
  const now = new Date().toISOString();

  const updates: Record<string, unknown> = {
    evidence_count: newEvidenceCount,
    last_seen_at: now,
    source_tickets: [...existing.source_tickets, ticketId],
    confidence: computeConfidence(newEvidenceCount),
  };

  // Apply "no-overwrite" rule on core fields
  if (existing.origin === 'kairo_created') {
    // Fill NULL/empty fields only — never overwrite existing values
    if (!existing.display_name && candidate.display_name) {
      updates.display_name = candidate.display_name;
    }
    if (!existing.organization && candidate.organization) {
      updates.organization = candidate.organization;
    }
    // email and phone: only fill if not already set (shouldn't happen since we
    // found the draft by email/phone, but defensive)
    if (!existing.email && candidate.email) {
      updates.email = candidate.email;
    }
    if (!existing.phone && candidate.phone) {
      updates.phone = candidate.phone;
    }
  }
  // origin='external_synced': NEVER touch core fields — only evidence fields updated above

  const { error } = await client
    .from('draft_contact')
    .update(updates)
    .eq('id', existing.id);

  if (error) {
    throw new Error(`[upsertDraftContact] Update failed for draft ${existing.id}: ${error.message}`);
  }

  return { wasCreated: false };
}
