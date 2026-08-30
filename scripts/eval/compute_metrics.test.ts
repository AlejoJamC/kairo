import { describe, it, expect } from "bun:test";
import { parseCsv, canonicalEmailId, adaptGroundTruth } from "./compute_metrics";
import {
  TICKET_TYPE, PRIORITY, CATEGORY, TONE, URGENCY,
} from "../../packages/intelligence/src/index";

// ---------------------------------------------------------------------------
// KAI-93: the ground-truth adapter no longer translates values — the sheet is
// canonical. What it still does is structural, and `difficulty` in particular
// has no consensus column of its own: it is derived from the two annotators.
// Deleting that derivation silently breaks the verdict, so it is frozen here.
// ---------------------------------------------------------------------------

const HEADERS = [
  "email_id",
  "tipo_ticket_final", "prioridad_final", "categoria_final",
  "tono_final_v130", "urgencia_final", "difficulty_final",
].join(",");

function sheet(...rows: string[]): string {
  return [HEADERS, ...rows].join("\n");
}

describe("canonicalEmailId", () => {
  it("joins zero-padded and bare ids", () => {
    expect(canonicalEmailId("001")).toBe("1");
    expect(canonicalEmailId(" 1 ")).toBe("1");
    expect(canonicalEmailId("050")).toBe("50");
  });

  it("does not eat a lone zero", () => {
    expect(canonicalEmailId("0")).toBe("0");
  });
});

describe("parseCsv", () => {
  it("keeps commas inside quoted cells", () => {
    const { rows } = parseCsv('a,b\n1,"x, y"');

    expect(rows[0]!["b"]).toBe("x, y");
  });

  it("handles escaped quotes and embedded newlines", () => {
    const { rows } = parseCsv('a,b\n1,"say ""hi""\nagain"');

    expect(rows[0]!["b"]).toBe('say "hi"\nagain');
  });
});

describe("adaptGroundTruth", () => {
  it("renames the Spanish consensus columns to canonical field names", () => {
    const out = adaptGroundTruth(parseCsv(
      sheet("1,support,P1,technical,frustrated,high,easy"),
    ));

    expect(out.headers).toEqual([
      "email_id", "ticket_type", "priority", "category", "tone", "urgency", "difficulty",
    ]);
    expect(out.rows[0]).toEqual({
      email_id: "1",
      ticket_type: "support",
      priority: "P1",
      category: "technical",
      tone: "frustrated",
      urgency: "high",
      difficulty: "easy",
    });
  });

  it("passes values through verbatim — no lowercasing", () => {
    const out = adaptGroundTruth(parseCsv(
      sheet("1,support,P1,technical,neutral,low,easy"),
    ));

    // Lowercasing here would turn P1 into p1 and break the join with predictions
    expect(out.rows[0]!["priority"]).toBe("P1");
  });

  it("drops Excel-export ghost rows with an empty email_id", () => {
    const out = adaptGroundTruth(parseCsv(sheet(
      "1,support,P1,technical,neutral,low,easy",
      ",,,,,,",
      "2,internal,P3,general,neutral,low,easy",
    )));

    expect(out.rows.map((r) => r["email_id"])).toEqual(["1", "2"]);
  });

  // `difficulty` used to have no consensus column: the adapter took the harsher
  // of the two annotators and called that the answer. That is a judgement, and
  // judgements on this sheet belong to the people making them -- every other
  // field is resolved by them, and this one was resolved by an `indexOf`.
  it("reads difficulty from its consensus column like every other field", () => {
    const out = adaptGroundTruth(parseCsv(sheet(
      "1,support,P1,technical,neutral,low,easy",
      "2,support,P1,technical,neutral,low,ambiguous",
      "3,support,P1,technical,neutral,low,hard",
    )));

    expect(out.rows.map((r) => r["difficulty"])).toEqual(["easy", "ambiguous", "hard"]);
  });

  it("leaves difficulty empty when the sheet did not resolve it", () => {
    const out = adaptGroundTruth(parseCsv(
      sheet("1,support,P1,technical,neutral,low,"),
    ));

    expect(out.rows[0]!["difficulty"]).toBe("");
  });

  it("passes an already-canonical file through untouched", () => {
    const parsed = parseCsv("email_id,ticket_type\n1,support");

    expect(adaptGroundTruth(parsed)).toBe(parsed);
  });
});

// ---------------------------------------------------------------------------
// The eval validates the ground truth against the same enums the pipeline
// emits. That coupling is the point — if someone edits the classification
// schema in packages/intelligence, this file has to notice.
// ---------------------------------------------------------------------------

describe("coupling with packages/intelligence", () => {
  it("imports every classification enum", () => {
    for (const e of [TICKET_TYPE, PRIORITY, CATEGORY, TONE, URGENCY]) {
      expect(Array.isArray(e)).toBe(true);
      expect(e.length).toBeGreaterThan(0);
      expect(e.every((v) => typeof v === "string" && v.length > 0)).toBe(true);
    }
  });

  it("still covers the values the ground truth sheet uses", () => {
    // Guards against a value being renamed or dropped from the schema without
    // the eval being updated
    for (const v of ["support", "internal"]) expect(TICKET_TYPE).toContain(v);
    for (const v of ["P1", "P2", "P3"]) expect(PRIORITY).toContain(v);
    for (const v of ["technical", "general"]) expect(CATEGORY).toContain(v);
    for (const v of ["neutral", "frustrated"]) expect(TONE).toContain(v);
    for (const v of ["high", "medium", "low"]) expect(URGENCY).toContain(v);
  });
});
