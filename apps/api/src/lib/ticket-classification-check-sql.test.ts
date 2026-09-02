import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  generateTicketsTicketTypeCheckSql,
  generateTicketsPriorityCheckSql,
  generateTicketsCategoryCheckSql,
  generateTicketsEmotionCheckSql,
  generateTicketsSentimentCheckSql,
  generateTicketTypeAutoApprovalCheckSql,
  generateTicketProposalsProposedEmotionCheckSql,
} from "./ticket-classification-check-sql.js";

// ---------------------------------------------------------------------------
// KAI-191 follow-up — codegen guard for the classification vocabulary.
//
// TICKET_TYPES / TICKET_PRIORITIES / TICKET_CATEGORIES / TICKET_TONES
// (packages/types/src/classification.ts) are mirrored by hand into six CHECK
// constraints across three tables. This test regenerates the exact SQL
// fragment for each constraint from the current arrays and asserts
// supabase/schema.sql still contains it verbatim — so a change to one of the
// four arrays that isn't matched by a migration (and a fresh
// `supabase db dump`) fails here instead of silently drifting.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/api/src/lib -> repo root
const SCHEMA_PATH = join(__dirname, "../../../../supabase/schema.sql");

describe("ticket-classification-check-sql codegen guard", () => {
  const schema = readFileSync(SCHEMA_PATH, "utf8");

  it("tickets.chk_ticket_type matches the constraint generated from TICKET_TYPES", () => {
    expect(schema).toContain(generateTicketsTicketTypeCheckSql());
  });

  it("tickets.chk_priority matches the constraint generated from TICKET_PRIORITIES", () => {
    expect(schema).toContain(generateTicketsPriorityCheckSql());
  });

  it("tickets.chk_category matches the constraint generated from TICKET_CATEGORIES", () => {
    expect(schema).toContain(generateTicketsCategoryCheckSql());
  });

  it("tickets.chk_emotion matches the constraint generated from TICKET_TONES", () => {
    expect(schema).toContain(generateTicketsEmotionCheckSql());
  });

  it("tickets.chk_sentiment matches the constraint generated from TICKET_TONES", () => {
    expect(schema).toContain(generateTicketsSentimentCheckSql());
  });

  it("ticket_type_auto_approval.chk_tta_ticket_type matches the constraint generated from TICKET_TYPES", () => {
    expect(schema).toContain(generateTicketTypeAutoApprovalCheckSql());
  });

  it("ticket_proposals.chk_proposed_emotion matches the constraint generated from TICKET_TONES", () => {
    expect(schema).toContain(generateTicketProposalsProposedEmotionCheckSql());
  });
});
