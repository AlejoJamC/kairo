import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// ---------------------------------------------------------------------------
// Guard for EXECUTE grants on SECURITY DEFINER functions.
//
// A SECURITY DEFINER function runs as its owner and bypasses RLS. PostgREST
// exposes every function in public at /rest/v1/rpc/<name>, and the anon key
// ships in the client bundle, so a definer function executable by PUBLIC,
// anon or authenticated is callable by anyone. Such a function must either be
// restricted to service_role or validate its caller with auth.uid().
//
// supabase/schema.sql is the dump of the linked database, so this test reads
// the real grants, not the intent written in a migration.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/api/src/lib -> repo root
const SCHEMA_PATH = join(__dirname, "../../../../supabase/schema.sql");

// Definer functions intentionally callable by signed-in users. Each one must
// check auth.uid() itself; the test below enforces that.
const CALLER_CHECKED_FUNCTIONS = new Set([
  "_assert_draft_access",
  "bulk_confirm_drafts_by_organization",
  "confirm_draft_contact",
  "edit_draft_contact",
  "has_account_access",
  "is_account_admin",
  "reject_draft_contact",
  "unreject_draft_contact",
]);

interface DefinerFunction {
  name: string;
  body: string;
}

function parseDefinerFunctions(schema: string): DefinerFunction[] {
  const functions: DefinerFunction[] = [];
  const pattern =
    /CREATE OR REPLACE FUNCTION "public"\."(\w+)"\([\s\S]*?\) RETURNS ([\s\S]*?)\n\s+LANGUAGE "\w+"( SECURITY DEFINER)?([\s\S]*?)\n\$\$;/g;
  for (const match of schema.matchAll(pattern)) {
    const [, name, returns, definer, body] = match;
    if (!definer) continue;
    // Trigger functions cannot be invoked through PostgREST.
    if (/^"?(trigger|event_trigger)"?$/.test(returns.trim())) continue;
    functions.push({ name, body });
  }
  return functions;
}

function isExposed(schema: string, name: string): boolean {
  const fn = `ON FUNCTION "public"."${name}"\\(`;
  const grantedToClientRole = new RegExp(
    `GRANT (ALL|EXECUTE) ${fn}[^;]*\\) TO "(anon|authenticated)";`
  ).test(schema);
  // pg_dump omits the PUBLIC grant when it is the default, so a missing
  // REVOKE ... FROM PUBLIC means PUBLIC can still execute the function.
  const revokedFromPublic = new RegExp(
    `REVOKE ALL ${fn}[^;]*\\) FROM PUBLIC;`
  ).test(schema);
  return grantedToClientRole || !revokedFromPublic;
}

describe("SECURITY DEFINER function EXECUTE grants", () => {
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  const definerFunctions = parseDefinerFunctions(schema);

  it("finds the definer functions in the schema dump", () => {
    expect(definerFunctions.length).toBeGreaterThan(0);
  });

  it("no definer function that trusts its arguments is executable by PUBLIC, anon or authenticated", () => {
    const exposed = definerFunctions
      .filter((fn) => !CALLER_CHECKED_FUNCTIONS.has(fn.name))
      .filter((fn) => isExposed(schema, fn.name))
      .map((fn) => fn.name)
      .sort();
    expect(exposed).toEqual([]);
  });

  it("every caller-checked definer function validates auth.uid()", () => {
    const unchecked = definerFunctions
      .filter((fn) => CALLER_CHECKED_FUNCTIONS.has(fn.name))
      .filter((fn) => !fn.body.includes("auth.uid()"))
      .map((fn) => fn.name)
      .sort();
    expect(unchecked).toEqual([]);
  });

  // The public-schema dump carries only the schema-scoped default privileges;
  // the PUBLIC default is global and is covered per function by isExposed().
  it("new functions in public are not executable by anon or authenticated by default", () => {
    const defaultGrantsToClientRoles = [
      ...schema.matchAll(
        /ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "(anon|authenticated)";/g
      ),
    ].map((match) => match[1]);
    expect(defaultGrantsToClientRoles).toEqual([]);
  });
});
