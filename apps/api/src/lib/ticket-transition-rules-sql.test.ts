import { describe, it, expect } from "bun:test";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  generateTransitionRulesSql,
  TRANSITION_RULES_BEGIN_MARKER,
  TRANSITION_RULES_END_MARKER,
} from "./ticket-transition-rules-sql.js";

// ---------------------------------------------------------------------------
// KAI-191 — codegen guard.
//
// ALLOWED_TRANSITIONS (ticket-status-machine.ts) is mirrored into the
// ticket_transition_rules seed embedded in the apply_ticket_transition
// migration. This test regenerates that INSERT block from the current
// TypeScript table and asserts it still matches, byte for byte, what's
// embedded in the migration between the BEGIN/END markers — so a change to
// ALLOWED_TRANSITIONS can never ship without also regenerating the SQL.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/api/src/lib -> repo root
const MIGRATIONS_DIR = join(__dirname, "../../../../supabase/migrations");

function findMigrationWithGeneratedBlock(): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const matches = files.filter((f) =>
    readFileSync(join(MIGRATIONS_DIR, f), "utf8").includes(TRANSITION_RULES_BEGIN_MARKER)
  );

  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one migration containing the ticket_transition_rules generated block, found ${matches.length}${
        matches.length ? `: ${matches.join(", ")}` : ""
      }`
    );
  }

  return join(MIGRATIONS_DIR, matches[0]);
}

describe("ticket-transition-rules-sql codegen guard", () => {
  it("regenerated SQL matches the block embedded in the migration byte for byte", () => {
    const migrationPath = findMigrationWithGeneratedBlock();
    const migrationContent = readFileSync(migrationPath, "utf8");

    const beginIdx = migrationContent.indexOf(TRANSITION_RULES_BEGIN_MARKER);
    const endIdx = migrationContent.indexOf(TRANSITION_RULES_END_MARKER);

    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(endIdx).toBeGreaterThan(beginIdx);

    const embedded = migrationContent
      .slice(beginIdx + TRANSITION_RULES_BEGIN_MARKER.length, endIdx)
      .trim();

    expect(embedded).toBe(generateTransitionRulesSql());
  });
});
