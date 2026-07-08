import * as React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";
import type { Ticket } from "@kairo/types";

// ---------------------------------------------------------------------------
// KAI-25: TicketHeader readOnly mode — hides mutation actions (assign,
// correction) for historical tickets opened from the related-history
// drawer, replacing the "Asignar a mí" button with a read-only badge.
// ---------------------------------------------------------------------------

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));

vi.mock("@/stores/triage-store", () => ({
  useTriageStore: () => ({
    applyCorrection: vi.fn(),
    correctedTicketIds: new Set<string>(),
    updateClassification: vi.fn(),
  }),
}));

vi.mock("@/lib/api-client", () => ({
  apiCall: vi.fn(() => Promise.resolve({ ok: false })),
}));

vi.mock("./correction-dialog", () => ({
  CorrectionDialog: ({ open }: { open: boolean }) =>
    open ? React.createElement("div", { "data-testid": "correction-dialog" }) : null,
}));

const { TicketHeader } = await import("./ticket-header");

function baseTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "t-1",
    ticket_number: 42,
    priority: "P1",
    ticket_type: "support",
    category: null,
    classified_at: "2026-06-01T10:00:00Z",
    received_at: "2026-06-01T10:00:00Z",
    assigned_to: null,
    ...overrides,
  } as unknown as Ticket;
}

describe("TicketHeader — read-only mode (KAI-25)", () => {
  it("shows assign button and correction trigger by default", () => {
    renderWithProviders(React.createElement(TicketHeader, { ticket: baseTicket() }));
    expect(screen.getByText("Asignar a mí")).toBeInTheDocument();
    expect(screen.getByText("correction.triggerLabel")).toBeInTheDocument();
    expect(screen.queryByText("ticketHeader.readOnlyBadge")).not.toBeInTheDocument();
  });

  it("hides assign button and correction trigger, shows read-only badge, when readOnly", () => {
    renderWithProviders(React.createElement(TicketHeader, { ticket: baseTicket(), readOnly: true }));
    expect(screen.queryByText("Asignar a mí")).not.toBeInTheDocument();
    expect(screen.queryByText("correction.triggerLabel")).not.toBeInTheDocument();
    expect(screen.getByText("ticketHeader.readOnlyBadge")).toBeInTheDocument();
  });
});
