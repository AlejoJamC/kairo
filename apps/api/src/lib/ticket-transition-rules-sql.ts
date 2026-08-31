// KAI-191 — codegen for the `ticket_transition_rules` table seeded by the
// apply_ticket_transition migration.
//
// ALLOWED_TRANSITIONS (ticket-status-machine.ts) is the single source of
// truth for which status changes are legal. The Postgres function that now
// owns every write to tickets.status must validate against the exact same
// rules, but Postgres cannot import a TypeScript module — so the rules are
// mirrored into a plain data table (`ticket_transition_rules`) that the
// function reads with a lookup, and this file generates the INSERT block
// embedded in that migration.
//
// This is deliberately NOT run at migration-apply time. It is run once, by
// hand, whenever ALLOWED_TRANSITIONS changes, to regenerate the INSERT block
// that gets pasted into a fresh migration file (see
// supabase/migrations/*_create_apply_ticket_transition.sql). To make sure a
// change to ALLOWED_TRANSITIONS can never be shipped without also
// regenerating that block, ticket-transition-rules-sql.test.ts re-generates
// the SQL from the current TypeScript table on every test run and asserts it
// still matches, byte for byte, what is embedded in the migration.
import { TICKET_STATUSES } from "@kairo/types";
import { ALLOWED_TRANSITIONS } from "./ticket-status-machine.js";

export const TRANSITION_RULES_BEGIN_MARKER =
  "-- BEGIN GENERATED FROM apps/api/src/lib/ticket-status-machine.ts ALLOWED_TRANSITIONS (see apps/api/src/lib/ticket-transition-rules-sql.ts)";
export const TRANSITION_RULES_END_MARKER = "-- END GENERATED";

/**
 * Produces the exact `INSERT INTO public.ticket_transition_rules (...) VALUES (...);`
 * statement that must be embedded verbatim (between the markers above) in the
 * apply_ticket_transition migration.
 */
export function generateTransitionRulesSql(): string {
  const rows: string[] = [];
  for (const from of TICKET_STATUSES) {
    for (const to of ALLOWED_TRANSITIONS[from]) {
      rows.push(`  ('${from}', '${to}')`);
    }
  }
  return `INSERT INTO public.ticket_transition_rules (from_state, to_state) VALUES\n${rows.join(",\n")};`;
}
