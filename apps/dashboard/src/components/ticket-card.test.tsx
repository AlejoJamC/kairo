import * as React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";
import type { Ticket } from "@kairo/types";

// ---------------------------------------------------------------------------
// KAI-168: PrioritySlaBadge — badge color/label per operational SLA state.
// Computed client-side from the ticket's own priority/received_at (tickets
// arrive raw from Supabase direct-fetch + realtime, never pre-enriched), so
// these tests drive state via real timestamps rather than a mocked field.
// Own domain from the existing SlaBadge (tenant/plan contractual SLA) —
// only this badge's own background/text changes; the sentiment stripe and
// SlaBadge are untouched (confirmed by not asserting on them here).
// ---------------------------------------------------------------------------

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => `${key}:${opts?.count ?? ""}`,
  }),
}));

const { TicketCard } = await import("./ticket-card");

// Default P1 config: max_response_seconds=3600 (1h)
function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function baseTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "t-1",
    ticket_number: 42,
    subject: "Need help",
    priority: "P1",
    ticket_type: "support",
    sentiment: "neutral",
    from_name: "Alice",
    from_email: "alice@example.com",
    received_at: minutesAgo(5),
    created_at: minutesAgo(5),
    first_response_at: null,
    sla_due_at: null,
    priority_score: null,
    classification_confidence: null,
    group_id: null,
    ...overrides,
  } as unknown as Ticket;
}

describe("PrioritySlaBadge (via TicketCard)", () => {
  it("renders nothing when the ticket has no priority", () => {
    const ticket = baseTicket({ priority: null });
    renderWithProviders(
      React.createElement(TicketCard, { ticket, selected: false, onSelect: () => {} })
    );
    expect(screen.queryByText(/prioritySla\./)).not.toBeInTheDocument();
  });

  it("shows a remaining-time label when under 50% of the priority's max response time", () => {
    // P1 max is 1h — 5 min elapsed is well under 50%.
    const ticket = baseTicket({ priority: "P1", received_at: minutesAgo(5) });
    renderWithProviders(
      React.createElement(TicketCard, { ticket, selected: false, onSelect: () => {} })
    );
    expect(screen.getByText(/prioritySla\.remainingMinutes/)).toBeInTheDocument();
  });

  it("shows a due-soon label when between 50% and 100% of the priority's max response time", () => {
    // P1 max is 1h — 45 min elapsed is 75%.
    const ticket = baseTicket({ priority: "P1", received_at: minutesAgo(45) });
    renderWithProviders(
      React.createElement(TicketCard, { ticket, selected: false, onSelect: () => {} })
    );
    expect(screen.getByText(/prioritySla\.dueInMinutes/)).toBeInTheDocument();
  });

  it("shows an overdue label when past 100% of the priority's max response time", () => {
    // P1 max is 1h — 2h elapsed is 200%.
    const ticket = baseTicket({ priority: "P1", received_at: minutesAgo(120) });
    renderWithProviders(
      React.createElement(TicketCard, { ticket, selected: false, onSelect: () => {} })
    );
    expect(screen.getByText(/prioritySla\.overdueHours/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// KAI-25: historical context trigger — shown only on the SELECTED card when
// the parent list found related history for it (no per-card fetch here).
// ---------------------------------------------------------------------------

describe("TicketCard — related-history trigger (KAI-25)", () => {
  it("does not render the trigger when the card is not selected, even if hasRelatedHistory is true", () => {
    const ticket = baseTicket();
    renderWithProviders(
      React.createElement(TicketCard, {
        ticket, selected: false, onSelect: () => {}, hasRelatedHistory: true, onOpenHistory: () => {},
      })
    );
    expect(screen.queryByText(/ticketCard\.viewRelatedHistory/)).not.toBeInTheDocument();
  });

  it("does not render the trigger when selected but hasRelatedHistory is false", () => {
    const ticket = baseTicket();
    renderWithProviders(
      React.createElement(TicketCard, {
        ticket, selected: true, onSelect: () => {}, hasRelatedHistory: false, onOpenHistory: () => {},
      })
    );
    expect(screen.queryByText(/ticketCard\.viewRelatedHistory/)).not.toBeInTheDocument();
  });

  it("renders the trigger and calls onOpenHistory with the ticket id when selected and hasRelatedHistory", () => {
    const ticket = baseTicket();
    const onOpenHistory = vi.fn();
    renderWithProviders(
      React.createElement(TicketCard, {
        ticket, selected: true, onSelect: () => {}, hasRelatedHistory: true, onOpenHistory,
      })
    );
    const trigger = screen.getByText(/ticketCard\.viewRelatedHistory/);
    expect(trigger).toBeInTheDocument();
    trigger.click();
    expect(onOpenHistory).toHaveBeenCalledWith("t-1");
  });
});
