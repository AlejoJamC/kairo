import { describe, it, expect, beforeEach } from "vitest";
import { useTriageStore, type Ticket } from "./triage-store";

// ---------------------------------------------------------------------------
// KAI-24 — manual multi-select + grouping + AI similarity dismissal actions.
// The store is a plain zustand instance, so these actions are exercised
// directly via getState()/setState() without rendering any component.
// ---------------------------------------------------------------------------

function ticket(id: string, overrides: Partial<Ticket> = {}): Ticket {
  return { id, group_id: null, ...overrides } as unknown as Ticket;
}

describe("triage-store — KAI-24 multi-select & grouping", () => {
  beforeEach(() => {
    useTriageStore.setState({
      tickets: [],
      selectedTicketIds: new Set<string>(),
      dismissedSimilarTicketIds: new Set<string>(),
    });
  });

  it("toggleTicketSelection adds then removes a ticket id", () => {
    useTriageStore.getState().toggleTicketSelection("t-1");
    expect(useTriageStore.getState().selectedTicketIds.has("t-1")).toBe(true);

    useTriageStore.getState().toggleTicketSelection("t-1");
    expect(useTriageStore.getState().selectedTicketIds.has("t-1")).toBe(false);
  });

  it("clearTicketSelection empties the selection", () => {
    useTriageStore.getState().toggleTicketSelection("t-1");
    useTriageStore.getState().toggleTicketSelection("t-2");
    useTriageStore.getState().clearTicketSelection();
    expect(useTriageStore.getState().selectedTicketIds.size).toBe(0);
  });

  it("setTicketsGroup assigns group_id only to the given ticket ids", () => {
    useTriageStore.setState({
      tickets: [ticket("t-1"), ticket("t-2"), ticket("t-3")],
    });
    useTriageStore.getState().setTicketsGroup(["t-1", "t-2"], "group-1");

    const { tickets } = useTriageStore.getState();
    expect(tickets.find((t) => t.id === "t-1")?.group_id).toBe("group-1");
    expect(tickets.find((t) => t.id === "t-2")?.group_id).toBe("group-1");
    expect(tickets.find((t) => t.id === "t-3")?.group_id).toBe(null);
  });

  it("dismissSimilarSuggestion marks a ticket id as dismissed for the session", () => {
    useTriageStore.getState().dismissSimilarSuggestion("t-1");
    expect(useTriageStore.getState().dismissedSimilarTicketIds.has("t-1")).toBe(true);
    expect(useTriageStore.getState().dismissedSimilarTicketIds.has("t-2")).toBe(false);
  });
});
