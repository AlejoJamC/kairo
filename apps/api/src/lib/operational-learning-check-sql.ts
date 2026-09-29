// KAI-55 follow-up — codegen for the operational_learning CHECK constraints,
// same pattern as ticket-classification-check-sql.ts. LEARNING_ORIGINS /
// LEARNING_STATUSES / OPERATIONAL_LEARNING_TYPES (packages/types/src/
// operational-learning.ts) are mirrored by hand into three CHECK constraints.
// This regenerates each fragment from the current arrays so a change to one
// that isn't matched by a migration (and a fresh `supabase db dump`) fails
// operational-learning-check-sql.test.ts instead of silently drifting.
import { LEARNING_ORIGINS, LEARNING_STATUSES, OPERATIONAL_LEARNING_TYPES } from "@kairo/types";

function arraySql(values: readonly string[]): string {
  return `ARRAY[${values.map((v) => `'${v}'::"text"`).join(", ")}]`;
}

/** `operational_learning.origin` — chk_operational_learning_origin. NOT NULL. */
export function generateOperationalLearningOriginCheckSql(): string {
  return `CONSTRAINT "chk_operational_learning_origin" CHECK (("origin" = ANY (${arraySql(LEARNING_ORIGINS)})))`;
}

/** `operational_learning.status` — chk_operational_learning_status. NOT NULL. */
export function generateOperationalLearningStatusCheckSql(): string {
  return `CONSTRAINT "chk_operational_learning_status" CHECK (("status" = ANY (${arraySql(LEARNING_STATUSES)})))`;
}

/** `operational_learning.learning_type` — chk_operational_learning_type. NOT NULL. */
export function generateOperationalLearningTypeCheckSql(): string {
  return `CONSTRAINT "chk_operational_learning_type" CHECK (("learning_type" = ANY (${arraySql(OPERATIONAL_LEARNING_TYPES)})))`;
}
