import * as React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";
import type { Ticket } from "@kairo/types";

// ---------------------------------------------------------------------------
// KAI-168: PrioritySlaBadge — badge color/label per operational SLA state.
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
    received_at: "2026-05-04T10:00:00Z",
    created_at: "2026-05-04T10:00:00Z",
    sla_due_at: null,
    priority_score: null,
    classification_confidence: null,
    group_id: null,
    operational_sla: null,
    ...overrides,
  } as unknown as Ticket;
}

describe("PrioritySlaBadge (via TicketCard)", () => {
  it("renders nothing when operational_sla is null", () => {
    const ticket = baseTicket({ operational_sla: null });
    renderWithProviders(
      React.createElement(TicketCard, { ticket, selected: false, onSelect: () => {} })
    );
    expect(screen.queryByText(/prioritySla\./)).not.toBeInTheDocument();
  });

  it("shows a remaining-time label when status is 'ok'", () => {
    const ticket = baseTicket({
      operational_sla: {
        status: "ok",
        percentUsed: 20,
        remainingSeconds: 2880,
        overdueSeconds: 0,
      } as never,
    });
    renderWithProviders(
      React.createElement(TicketCard, { ticket, selected: false, onSelect: () => {} })
    );
    expect(screen.getByText(/prioritySla\.remainingMinutes/)).toBeInTheDocument();
  });

  it("shows a due-soon label when status is 'at_risk'", () => {
    const ticket = baseTicket({
      operational_sla: {
        status: "at_risk",
        percentUsed: 75,
        remainingSeconds: 900,
        overdueSeconds: 0,
      } as never,
    });
    renderWithProviders(
      React.createElement(TicketCard, { ticket, selected: false, onSelect: () => {} })
    );
    expect(screen.getByText(/prioritySla\.dueInMinutes/)).toBeInTheDocument();
  });

  it("shows an overdue label when status is 'breached'", () => {
    const ticket = baseTicket({
      operational_sla: {
        status: "breached",
        percentUsed: 150,
        remainingSeconds: 0,
        overdueSeconds: 3600,
      } as never,
    });
    renderWithProviders(
      React.createElement(TicketCard, { ticket, selected: false, onSelect: () => {} })
    );
    expect(screen.getByText(/prioritySla\.overdueHours/)).toBeInTheDocument();
  });
});
