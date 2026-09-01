import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  generateTicketsStatusCheckSql,
  generateTicketStateHistoryToStateCheckSql,
  generateTicketStateHistoryFromStateCheckSql,
} from "./ticket-status-check-sql.js";

// ---------------------------------------------------------------------------
// KAI-191 — codegen guard.
//
// TICKET_STATUSES (packages/types/src/index.ts) is mirrored by hand into
// three CHECK constraints in the database: tickets_status_check,
// ticket_state_history_from_state_check and
// ticket_state_history_to_state_check. This test regenerates the exact SQL
// fragment for each constraint from the current TICKET_STATUSES and asserts
// supabase/schema.sql still contains it verbatim — so a change to
// TICKET_STATUSES that isn't matched by a migration (and a fresh
// `supabase db dump`) fails here instead of silently drifting.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/api/src/lib -> repo root
const SCHEMA_PATH = join(__dirname, "../../../../supabase/schema.sql");

describe("ticket-status-check-sql codegen guard", () => {
  const schema = readFileSync(SCHEMA_PATH, "utf8");

  it("tickets_status_check matches the constraint generated from TICKET_STATUSES", () => {
    expect(schema).toContain(generateTicketsStatusCheckSql());
  });

  it("ticket_state_history_to_state_check matches the constraint generated from TICKET_STATUSES", () => {
    expect(schema).toContain(generateTicketStateHistoryToStateCheckSql());
  });

  it("ticket_state_history_from_state_check matches the constraint generated from TICKET_STATUSES", () => {
    expect(schema).toContain(generateTicketStateHistoryFromStateCheckSql());
  });
});
