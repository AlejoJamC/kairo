import { describe, expect, it } from "vitest";
import {
  ACTIONABILITY,
  PROVENANCE,
  SUBJECT_MATTER,
  TICKET_CATEGORIES,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  TICKET_TONES,
  TICKET_TYPES,
  TICKET_URGENCIES,
} from "@kairo/types";
import { readFileSync } from "node:fs";
import { generate } from "../scripts/generate.ts";

const { resolved, css, ts } = generate();

describe("design tokens", () => {
  it("resolves every reference", () => {
    expect(Object.keys(resolved).length).toBeGreaterThan(0);
    expect(JSON.stringify(resolved)).not.toMatch(/\{[a-z][a-z0-9.-]*\}/i);
  });

  it.each([
    ["ticketType", TICKET_TYPES],
    ["priority", TICKET_PRIORITIES],
    ["category", TICKET_CATEGORIES],
    ["sentiment", TICKET_TONES],
    ["urgency", TICKET_URGENCIES],
    ["actionability", ACTIONABILITY],
    ["subjectMatter", SUBJECT_MATTER],
    ["provenance", PROVENANCE],
    ["status", TICKET_STATUSES],
  ] as const)("has an entry for every %s value", (group, values) => {
    for (const value of values) {
      expect(Object.keys(resolved), `${group}.${value}`).toContain(`${group}.${value}`);
    }
  });

  it("keeps the committed generated files in sync", () => {
    const dir = new URL("../generated/", import.meta.url);
    expect(readFileSync(new URL("tokens.css", dir), "utf8")).toBe(css);
    expect(readFileSync(new URL("tokens.ts", dir), "utf8")).toBe(ts);
  });
});
