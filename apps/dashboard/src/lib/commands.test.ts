import { describe, expect, it } from "vitest";
import enDashboard from "@/i18n/resources/en/dashboard.json";
import esDashboard from "@/i18n/resources/es/dashboard.json";
import { COMMAND_GROUPS, COMMANDS, CONTEXT_TABS, GO_VIEWS, PRIORITY_FILTERS } from "./commands";

describe("commands", () => {
  it("lists the commands once each", () => {
    expect(COMMANDS).toHaveLength(37);
    expect(new Set(COMMANDS.map((command) => command.id)).size).toBe(37);
  });

  it("splits them into the four groups of the palette", () => {
    const counts = Object.fromEntries(COMMAND_GROUPS.map((group) => [group, COMMANDS.filter((command) => command.group === group).length]));
    expect(counts).toEqual({ ticket: 11, goTo: 11, view: 12, general: 3 });
  });

  it("has a label in English and Spanish for every command and group", () => {
    for (const bundle of [enDashboard, esDashboard]) {
      for (const command of COMMANDS) expect(bundle.commands.items).toHaveProperty(command.id);
      for (const group of COMMAND_GROUPS) expect(bundle.commands.groups).toHaveProperty(group);
    }
  });

  it("opens the four tabs of the context panel with ⌘1 to ⌘4", () => {
    const keys = COMMANDS.filter((command) => command.id in CONTEXT_TABS).map((command) => command.keys?.join(""));
    expect(keys).toEqual(["⌘1", "⌘2", "⌘3", "⌘4"]);
    expect(Object.values(CONTEXT_TABS)).toEqual(["client", "assistant", "notes", "escalate"]);
  });

  it("filters the Triage priority with P then 0 to 3", () => {
    const keys = COMMANDS.filter((command) => command.id in PRIORITY_FILTERS).map((command) => command.keys?.join(""));
    expect(keys).toEqual(["P0", "P1", "P2", "P3"]);
    expect(Object.values(PRIORITY_FILTERS)).toEqual(["all", "P1", "P2", "P3"]);
  });

  it("opens every view from a go-to command", () => {
    expect(Object.keys(GO_VIEWS)).toHaveLength(8);
  });
});
