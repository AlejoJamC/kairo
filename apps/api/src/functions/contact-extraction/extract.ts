/**
 * KAI-225 — Contact Extraction Worker (Pasada A — heurística)
 *
 * Triggered by `tickets/ticket.created`. For each new ticket, extracts
 * contact candidates from email headers and proposes them as `draft_contact`
 * rows in the database.
 *
 * This is Pasada A only. Phone extraction (Pasada B / LLM) is KAI-238.
 * See ADR-021 for the full pipeline design.
 */

import { inngest } from '../../lib/inngest.js';
import { supabase } from '../../lib/supabase.js';
import { loadTicketCorpus } from '../../lib/contact-extraction/load-corpus.js';
import { extractCandidatesHeuristic } from '../../lib/contact-extraction/candidates.js';
import { filterCandidates } from '../../lib/contact-extraction/exclusions.js';
import { upsertDraftContact } from '../../lib/contact-extraction/upsert.js';
import {
  startWorkerRun,
  finishWorkerRun,
  failWorkerRun,
} from '../../lib/contact-extraction/worker-run.js';
import type { ExtractionResult } from '../../lib/contact-extraction/types.js';

const WORKER_NAME = 'contact_extraction';

export const contactExtraction = inngest.createFunction(
  {
    id: 'contact-extraction',
    // Serialize runs for the same ticket to avoid concurrent upserts on the same rows.
    concurrency: { limit: 5, key: 'event.data.ticketId' },
    triggers: [{ event: 'tickets/ticket.created' }],
  },
  async ({ event, step }) => {
    const { ticketId, accountId } = event.data as { ticketId: string; accountId: string };

    // -------------------------------------------------------------------------
    // Step 1: Record run start
    // -------------------------------------------------------------------------
    const runId = await step.run('start-run', async () => {
      return startWorkerRun(supabase, {
        worker: WORKER_NAME,
        accountId,
        triggerEvent: 'tickets/ticket.created',
        triggerPayload: { ticketId, accountId },
      });
    }) as string;

    try {
      // -----------------------------------------------------------------------
      // Step 2: Load ticket corpus
      // -----------------------------------------------------------------------
      const corpus = await step.run('load-corpus', async () => {
        return loadTicketCorpus(supabase, ticketId);
      });

      // -----------------------------------------------------------------------
      // Step 3: Extract candidates (heuristic, Pasada A)
      // -----------------------------------------------------------------------
      const rawCandidates = await step.run('extract-heuristic', async () => {
        return extractCandidatesHeuristic(corpus);
      });

      // -----------------------------------------------------------------------
      // Step 4: Load tenant internal emails + filter candidates
      // -----------------------------------------------------------------------
      const filtered = await step.run('filter', async () => {
        // Load tenant's own channel email addresses (to exclude them)
        const { data: channelRows } = await supabase
          .from('channel_integrations')
          .select('display_name')
          .eq('account_id', accountId);

        const tenantInternalEmails = new Set<string>(
          (channelRows ?? [])
            .map((r) => (r.display_name ?? '').toLowerCase().trim())
            .filter(Boolean),
        );

        // Build CC count map for Rule 3 (mass CC exclusion):
        // Count how many times each CC email appears as cc-only across all messages.
        const ccCountByEmail = new Map<string, number>();
        for (const c of rawCandidates) {
          if (c.evidence_role === 'cc' && c.email) {
            ccCountByEmail.set(c.email, (ccCountByEmail.get(c.email) ?? 0) + 1);
          }
        }

        return filterCandidates(rawCandidates, { tenantInternalEmails }, ccCountByEmail);
      });

      // -----------------------------------------------------------------------
      // Step 5: Upsert each surviving candidate as a draft_contact
      // -----------------------------------------------------------------------
      const result = await step.run('upsert-loop', async () => {
        const accumulator: ExtractionResult = {
          candidates_count: rawCandidates.length,
          excluded_count: rawCandidates.length - filtered.length,
          drafts_created: 0,
          drafts_updated: 0,
        };

        for (const candidate of filtered) {
          const { wasCreated } = await upsertDraftContact(
            supabase,
            accountId,
            ticketId,
            candidate,
          );
          if (wasCreated) {
            accumulator.drafts_created++;
          } else {
            accumulator.drafts_updated++;
          }
        }

        return accumulator;
      });

      // -----------------------------------------------------------------------
      // Step 6: Mark run as succeeded
      // -----------------------------------------------------------------------
      await step.run('finish-run', async () => {
        await finishWorkerRun(supabase, runId, result);
      });

      return result;
    } catch (err) {
      // Mark the run as failed — do not re-throw so the error detail is
      // captured in worker_runs. Inngest will still mark the function as
      // failed via its own error handling.
      await failWorkerRun(supabase, runId, err);
      throw err;
    }
  },
);
