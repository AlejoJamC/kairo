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

const { resolved, dark, css, ts } = generate();

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

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

  describe("dark theme", () => {
    it("overrides the surfaces, lines, text and ink colors", () => {
      expect(dark["color.bg"]).toBe("#0C0C0E");
      expect(dark["color.surface"]).toBe("#131316");
      expect(dark["color.text"]).toBe("#EDEDF0");
      expect(dark["color.accent-ink"]).toBe("#7BA4FF");
      expect(dark["color.accent-soft"]).toBe("rgba(43,91,255,0.17)");
      expect(dark["color.note-soft"]).toBe("#1F1A10");
      expect(dark["color.glass"]).toBe("rgba(12,12,14,0.78)");
    });

    it("carries the overrides through the semantic tokens that reference them", () => {
      expect(dark["surface.page"]).toBe("#0C0C0E");
      expect(dark["surface.panel"]).toBe("#131316");
      expect(dark["surface.sidebar"]).toBe("#0A0A0C");
    });

    it("overrides the shadows", () => {
      expect(dark["shadow.xs"]).toBe("none");
      expect(dark["shadow.pop"]).toBe("0px 12px 32px 0px rgba(0,0,0,0.5)");
      expect(dark["shadow.frame"]).toBe("0px 32px 80px -32px rgba(0,0,0,0.7)");
    });

    it("lists only what changes: the accent and the status colors keep their light value", () => {
      expect(dark["color.accent"]).toBeUndefined();
      expect(dark["color.ok"]).toBeUndefined();
      for (const [path, value] of Object.entries(dark)) {
        expect(JSON.stringify(value), path).not.toBe(JSON.stringify(resolved[path]));
      }
    });

    it("keeps the light values untouched", () => {
      expect(resolved["color.bg"]).toBe("#FFFFFF");
      expect(resolved["surface.panel"]).toBe("#FFFFFF");
    });

    it("emits the dark values under data-theme=dark and the light ones under :root", () => {
      const [light, darkBlock] = css.split('[data-theme="dark"]');
      expect(light).toContain(':root, [data-theme="light"] {');
      expect(light).toContain("--kairo-color-bg: #FFFFFF;");
      expect(darkBlock).toContain("--kairo-color-bg: #0C0C0E;");
      expect(darkBlock).not.toContain("--kairo-color-accent: ");
    });

    it("keeps the text colors readable on the dark surfaces (4.5:1)", () => {
      const pairs: [string, string][] = [
        ["color.text", "color.bg"],
        ["color.muted", "color.bg"],
        ["color.muted", "color.surface"],
        ["color.faint", "color.bg"],
        ["color.faint", "color.surface"],
        ["color.faint", "color.hover"],
        ["color.accent-ink", "color.surface"],
        ["color.ok-ink", "color.surface"],
        ["color.bad-ink", "color.surface"],
        ["color.note", "color.note-soft"],
      ];
      for (const [fg, bg] of pairs) {
        const fgValue = String(dark[fg] ?? resolved[fg]);
        const bgValue = String(dark[bg] ?? resolved[bg]);
        expect(contrast(fgValue, bgValue), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  });
});
