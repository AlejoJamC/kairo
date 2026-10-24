import * as React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";
import type { Ticket } from "@kairo/types";

// ---------------------------------------------------------------------------
// TicketHeader (the ticket bar) and TicketHeadingBlock (subject, classification
// and the correction trigger). KAI-25: read-only mode hides the mutation
// actions for historical tickets. The "Asignar a mí" button is also gated by
// the build-time VITE_FF_ENABLE_ASSIGN_TO_ME flag (default OFF) — the flag is
// read once at module load, so each case that needs a specific value calls
// vi.resetModules() and re-imports after stubbing the env var.
// ---------------------------------------------------------------------------

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === "string" ? fallback : key,
  }),
}));

vi.mock("@kairo/client-core/stores/triage-store", () => {
  const state = {
    applyCorrection: vi.fn(),
    correctedTicketIds: new Set<string>(),
    updateClassification: vi.fn(),
    selectRelativeTicket: vi.fn(),
    queueIds: ["t-1", "t-2"],
    tickets: [],
    selectTicket: vi.fn(),
    noteCounts: {},
  };
  const useTriageStore = Object.assign((selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state), {
    subscribe: () => () => {},
  });
  return { useTriageStore };
});

vi.mock("@kairo/client-core/api-client", () => ({
  apiCall: vi.fn(() => Promise.resolve({ ok: false })),
}));

function baseTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: "t-1",
    ticket_number: 42,
    subject: "Export fails",
    status: "open",
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

describe("TicketHeader — the ticket bar", () => {
  it("shows the breadcrumb, the position in the queue and the status chip", async () => {
    vi.resetModules();
    const { TicketHeader } = await import("./ticket-header");
    renderWithProviders(React.createElement(TicketHeader, { ticket: baseTicket(), queueName: "Triage" }));
    expect(screen.getByText("KAI-42")).toBeInTheDocument();
    expect(screen.getByText("ticketHeader.position")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ticketStatus\.open/ })).toBeInTheDocument();
  });

  it("hides assign button by default (VITE_FF_ENABLE_ASSIGN_TO_ME unset)", async () => {
    vi.resetModules();
    const { TicketHeader } = await import("./ticket-header");
    renderWithProviders(React.createElement(TicketHeader, { ticket: baseTicket(), queueName: "Triage" }));
    expect(screen.queryByText("Asignar a mí")).not.toBeInTheDocument();
    expect(screen.queryByText("ticketHeader.readOnlyBadge")).not.toBeInTheDocument();
  });

  it("shows the assign button when VITE_FF_ENABLE_ASSIGN_TO_ME=true", async () => {
    vi.stubEnv("VITE_FF_ENABLE_ASSIGN_TO_ME", "true");
    vi.resetModules();
    const { TicketHeader } = await import("./ticket-header");
    renderWithProviders(React.createElement(TicketHeader, { ticket: baseTicket(), queueName: "Triage" }));
    expect(screen.getByText("Asignar a mí")).toBeInTheDocument();
  });

  it("hides assign button and the status menu, shows the read-only chip, when readOnly (flag on or off)", async () => {
    vi.stubEnv("VITE_FF_ENABLE_ASSIGN_TO_ME", "true");
    vi.resetModules();
    const { TicketHeader } = await import("./ticket-header");
    renderWithProviders(React.createElement(TicketHeader, { ticket: baseTicket({ status: "resolved" }), queueName: "Resolved", readOnly: true }));
    expect(screen.queryByText("Asignar a mí")).not.toBeInTheDocument();
    expect(screen.getByText("ticketHeader.readOnlyBadge")).toBeInTheDocument();
  });

  it("still shows the 'Asignado' badge for an already-assigned ticket even when the flag is off", async () => {
    vi.resetModules();
    const { TicketHeader } = await import("./ticket-header");
    renderWithProviders(React.createElement(TicketHeader, { ticket: baseTicket({ assigned_to: "user-1" }), queueName: "Triage" }));
    expect(screen.getByText("Asignado")).toBeInTheDocument();
  });

  it("marks an escalated ticket with the escalated pill", async () => {
    vi.resetModules();
    const { TicketHeader } = await import("./ticket-header");
    renderWithProviders(React.createElement(TicketHeader, { ticket: baseTicket({ status: "escalated" }), queueName: "Escalated" }));
    expect(screen.getByText("ticketHeader.escalated")).toBeInTheDocument();
  });
});

describe("TicketHeadingBlock — subject and classification", () => {
  it("shows the subject, the priority chip and the correction trigger", async () => {
    vi.resetModules();
    const { TicketHeadingBlock } = await import("./ticket-header");
    renderWithProviders(React.createElement(TicketHeadingBlock, { ticket: baseTicket() }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Export fails");
    expect(screen.getByText("correction.triggerLabel")).toBeInTheDocument();
  });

  it("hides the correction trigger and the priority menu when readOnly", async () => {
    vi.resetModules();
    const { TicketHeadingBlock } = await import("./ticket-header");
    renderWithProviders(React.createElement(TicketHeadingBlock, { ticket: baseTicket(), readOnly: true }));
    expect(screen.queryByText("correction.triggerLabel")).not.toBeInTheDocument();
  });
});
