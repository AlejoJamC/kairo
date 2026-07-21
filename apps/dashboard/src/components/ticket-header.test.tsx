import * as React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";
import type { Ticket } from "@kairo/types";

// ---------------------------------------------------------------------------
// KAI-25: TicketHeader readOnly mode — hides mutation actions (assign,
// correction) for historical tickets opened from the related-history
// drawer, replacing the "Asignar a mí" button with a read-only badge.
//
// The "Asignar a mí" button is also gated by the build-time
// VITE_FF_ENABLE_ASSIGN_TO_ME flag (default OFF) — the flag is read once at
// module load, so each case that needs a specific value calls
// vi.resetModules() and re-imports after stubbing the env var.
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

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("TicketHeader — read-only mode (KAI-25)", () => {
  it("hides assign button by default (VITE_FF_ENABLE_ASSIGN_TO_ME unset), still shows correction trigger", async () => {
    vi.resetModules();
    const { TicketHeader } = await import("./ticket-header");
    renderWithProviders(React.createElement(TicketHeader, { ticket: baseTicket() }));
    expect(screen.queryByText("Asignar a mí")).not.toBeInTheDocument();
    expect(screen.getByText("correction.triggerLabel")).toBeInTheDocument();
    expect(screen.queryByText("ticketHeader.readOnlyBadge")).not.toBeInTheDocument();
  });

  it("shows the assign button when VITE_FF_ENABLE_ASSIGN_TO_ME=true", async () => {
    vi.stubEnv("VITE_FF_ENABLE_ASSIGN_TO_ME", "true");
    vi.resetModules();
    const { TicketHeader } = await import("./ticket-header");
    renderWithProviders(React.createElement(TicketHeader, { ticket: baseTicket() }));
    expect(screen.getByText("Asignar a mí")).toBeInTheDocument();
  });

  it("hides assign button and correction trigger, shows read-only badge, when readOnly (flag on or off)", async () => {
    vi.stubEnv("VITE_FF_ENABLE_ASSIGN_TO_ME", "true");
    vi.resetModules();
    const { TicketHeader } = await import("./ticket-header");
    renderWithProviders(React.createElement(TicketHeader, { ticket: baseTicket(), readOnly: true }));
    expect(screen.queryByText("Asignar a mí")).not.toBeInTheDocument();
    expect(screen.queryByText("correction.triggerLabel")).not.toBeInTheDocument();
    expect(screen.getByText("ticketHeader.readOnlyBadge")).toBeInTheDocument();
  });

  it("still shows the 'Asignado' badge for an already-assigned ticket even when the flag is off", async () => {
    vi.resetModules();
    const { TicketHeader } = await import("./ticket-header");
    renderWithProviders(React.createElement(TicketHeader, { ticket: baseTicket({ assigned_to: "user-1" }) }));
    expect(screen.getByText("Asignado")).toBeInTheDocument();
  });
});
