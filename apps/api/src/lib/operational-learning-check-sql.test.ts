import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  generateOperationalLearningOriginCheckSql,
  generateOperationalLearningStatusCheckSql,
  generateOperationalLearningTypeCheckSql,
} from "./operational-learning-check-sql.js";

// ---------------------------------------------------------------------------
// KAI-55 follow-up — codegen guard for the operational_learning vocabulary,
// same pattern ticket-classification-check-sql.test.ts uses for the
// classification enums.
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
// apps/api/src/lib -> repo root
const SCHEMA_PATH = join(__dirname, "../../../../supabase/schema.sql");

describe("operational-learning-check-sql codegen guard", () => {
  const schema = readFileSync(SCHEMA_PATH, "utf8");

  it("operational_learning.chk_operational_learning_origin matches the constraint generated from LEARNING_ORIGINS", () => {
    expect(schema).toContain(generateOperationalLearningOriginCheckSql());
  });

  it("operational_learning.chk_operational_learning_status matches the constraint generated from LEARNING_STATUSES", () => {
    expect(schema).toContain(generateOperationalLearningStatusCheckSql());
  });

  it("operational_learning.chk_operational_learning_type matches the constraint generated from OPERATIONAL_LEARNING_TYPES", () => {
    expect(schema).toContain(generateOperationalLearningTypeCheckSql());
  });
});
