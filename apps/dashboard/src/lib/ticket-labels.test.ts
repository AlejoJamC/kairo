import { describe, expect, it } from "vitest";
import { TICKET_CATEGORIES, TICKET_TYPES } from "@kairo/types";
import { normalizeTicketCategory, normalizeTicketType } from "./ticket-labels";

describe("normalizeTicketType", () => {
  it.each(TICKET_TYPES)("keeps %s", (type) => {
    expect(normalizeTicketType(type)).toBe(type);
    expect(normalizeTicketType(type.toUpperCase())).toBe(type);
  });

  it("maps the legacy lead value to prospect", () => {
    expect(normalizeTicketType("lead")).toBe("prospect");
  });

  it.each([null, undefined, "", "unknown"])("falls back to support for %s", (raw) => {
    expect(normalizeTicketType(raw)).toBe("support");
  });
});

describe("normalizeTicketCategory", () => {
  it.each(TICKET_CATEGORIES)("keeps %s", (category) => {
    expect(normalizeTicketCategory(category)).toBe(category);
  });

  it.each([null, undefined, "", "Billing issues"])("returns null for %s", (raw) => {
    expect(normalizeTicketCategory(raw)).toBeNull();
  });
});
