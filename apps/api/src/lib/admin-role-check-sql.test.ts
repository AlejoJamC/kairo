import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { generateAdminUsersRoleCheckSql } from "./admin-role-check-sql.js";

// ---------------------------------------------------------------------------
// KAI-191 follow-up — codegen guard for the Kelan admin role vocabulary.
//
// ADMIN_ROLES (packages/types/src/admin.ts) is mirrored by hand into
// admin_users_role_check. This test regenerates the exact SQL fragment from
// the current array and asserts supabase/schema.sql still contains it
// verbatim — so a change to ADMIN_ROLES that isn't matched by a migration
// (and a fresh `supabase db dump`) fails here instead of silently drifting.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/api/src/lib -> repo root
const SCHEMA_PATH = join(__dirname, "../../../../supabase/schema.sql");

describe("admin-role-check-sql codegen guard", () => {
  const schema = readFileSync(SCHEMA_PATH, "utf8");

  it("admin_users.admin_users_role_check matches the constraint generated from ADMIN_ROLES", () => {
    expect(schema).toContain(generateAdminUsersRoleCheckSql());
  });
});
