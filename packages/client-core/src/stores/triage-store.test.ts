import { describe, it, expect, beforeEach } from "vitest";
import { useTriageStore, pickPreferredGroupId, type Ticket } from "./triage-store";

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

// ---------------------------------------------------------------------------
// KAI-108 — pickPreferredGroupId: reuse an existing group instead of always
// creating a new one when grouping/accepting a similarity suggestion.
// ---------------------------------------------------------------------------

describe("pickPreferredGroupId", () => {
  it("returns null when none of the given tickets belong to a group", () => {
    const tickets = [ticket("t-1"), ticket("t-2"), ticket("t-3")];
    expect(pickPreferredGroupId(tickets, ["t-1", "t-2"])).toBe(null);
  });

  it("returns the group_id of the first grouped ticket in list order", () => {
    const tickets = [
      ticket("t-1"),
      ticket("t-2", { group_id: "group-a" }),
      ticket("t-3", { group_id: "group-b" }),
    ];
    // t-2 comes before t-3 in the ids array, so group-a wins even though
    // both t-2 and t-3 already belong to (different) groups.
    expect(pickPreferredGroupId(tickets, ["t-1", "t-2", "t-3"])).toBe("group-a");
  });

  it("ignores tickets not present in the given id list", () => {
    const tickets = [ticket("t-1", { group_id: "group-a" }), ticket("t-2")];
    expect(pickPreferredGroupId(tickets, ["t-2"])).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Queue navigation and keyboard requests: J / K move through the visible queue,
// A / R / E ask the composer or the context panel to act.
// ---------------------------------------------------------------------------

describe("triage-store — queue navigation and requests", () => {
  beforeEach(() => {
    useTriageStore.setState({
      selectedTicketId: null,
      queueIds: [],
      ticketActionRequest: null,
      panelTabRequest: null,
      composerPrefill: null,
    });
  });

  it("setQueueIds keeps the same array when the ids did not change", () => {
    useTriageStore.getState().setQueueIds(["t-1", "t-2"]);
    const first = useTriageStore.getState().queueIds;
    useTriageStore.getState().setQueueIds(["t-1", "t-2"]);
    expect(useTriageStore.getState().queueIds).toBe(first);
  });

  it("selectRelativeTicket moves to the next and previous ticket and stops at the ends", () => {
    useTriageStore.setState({ queueIds: ["t-1", "t-2", "t-3"], selectedTicketId: "t-1" });
    useTriageStore.getState().selectRelativeTicket(1);
    expect(useTriageStore.getState().selectedTicketId).toBe("t-2");
    useTriageStore.getState().selectRelativeTicket(1);
    useTriageStore.getState().selectRelativeTicket(1);
    expect(useTriageStore.getState().selectedTicketId).toBe("t-3");
    useTriageStore.getState().selectRelativeTicket(-1);
    expect(useTriageStore.getState().selectedTicketId).toBe("t-2");
    useTriageStore.setState({ selectedTicketId: "t-1" });
    useTriageStore.getState().selectRelativeTicket(-1);
    expect(useTriageStore.getState().selectedTicketId).toBe("t-1");
  });

  it("selectRelativeTicket selects the first ticket when none is open and does nothing on an empty queue", () => {
    useTriageStore.getState().selectRelativeTicket(1);
    expect(useTriageStore.getState().selectedTicketId).toBeNull();
    useTriageStore.setState({ queueIds: ["t-1", "t-2"] });
    useTriageStore.getState().selectRelativeTicket(1);
    expect(useTriageStore.getState().selectedTicketId).toBe("t-1");
  });

  it("each ticket action and panel tab request carries a new nonce", () => {
    useTriageStore.getState().requestTicketAction("resolve");
    const first = useTriageStore.getState().ticketActionRequest;
    useTriageStore.getState().requestTicketAction("resolve");
    expect(useTriageStore.getState().ticketActionRequest?.nonce).toBe((first?.nonce ?? 0) + 1);
    useTriageStore.getState().clearTicketActionRequest();
    expect(useTriageStore.getState().ticketActionRequest).toBeNull();

    useTriageStore.getState().requestPanelTab("escalate");
    expect(useTriageStore.getState().panelTabRequest).toMatchObject({ tab: "escalate" });
    useTriageStore.getState().clearPanelTabRequest();
    expect(useTriageStore.getState().panelTabRequest).toBeNull();
  });

  it("composerPrefill holds the follow-up until it is consumed", () => {
    useTriageStore.getState().setComposerPrefill("Hi Ana");
    expect(useTriageStore.getState().composerPrefill).toBe("Hi Ana");
    useTriageStore.getState().setComposerPrefill(null);
    expect(useTriageStore.getState().composerPrefill).toBeNull();
  });
});
