import { describe, expect, it } from "vitest";
import { buildAppMenu, type AppMenuState } from "@kairo/ui";
import { disableUnhandled, localizeMenu } from "./desktop-menu";

const state: AppMenuState = {
  view: "triage",
  language: "es",
  sidebarExpanded: true,
  ticketOpen: true,
  ticketAwaitingCustomer: false,
  ticketFinal: false,
  ticketPriority: "P1",
  ticketStatus: "open",
  statusOptions: [],
  composerEmpty: false,
  similarTicketId: null,
};

function find(groups: ReturnType<typeof buildAppMenu>, id: string) {
  for (const group of groups) {
    for (const item of group.items) {
      if ("id" in item && item.id === id) return item;
    }
  }
  return undefined;
}

describe("desktop menu", () => {
  it("translates groups and items by id and keeps the original label when there is no translation", () => {
    const groups = localizeMenu(buildAppMenu(state), (id) => ({ go: "Ir", "go-triage": "Triage", resolve: "Resolver" })[id]);
    expect(groups.find((group) => group.id === "go")?.label).toBe("Ir");
    expect(groups.find((group) => group.id === "ticket")?.label).toBe("Ticket");
    expect(find(groups, "resolve")).toMatchObject({ label: "Resolver" });
    expect(find(groups, "escalate")).toMatchObject({ label: "Escalate" });
  });

  it("disables what has no handler but never the system items or the handled ones", () => {
    const handled = new Set(["resolve", "settings"]);
    const groups = disableUnhandled(buildAppMenu(state), handled);
    expect(find(groups, "resolve")).toMatchObject({ disabled: false });
    expect(find(groups, "settings")).not.toMatchObject({ disabled: true });
    expect(find(groups, "escalate")).toMatchObject({ disabled: true });
    expect(find(groups, "copy")).not.toMatchObject({ disabled: true });
    expect(find(groups, "quit")).not.toMatchObject({ disabled: true });
  });
});
