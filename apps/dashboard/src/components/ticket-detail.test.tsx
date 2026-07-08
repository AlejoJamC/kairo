import * as React from "react";
import { screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithProviders } from "@/test/render-with-providers";

// ---------------------------------------------------------------------------
// KAI-165: TicketDetail renders thread messages (or fallback to body_plain)
// ---------------------------------------------------------------------------

const mockMessages = [
  {
    id: "msg-1",
    direction: "inbound",
    sender_external_id: "alice@example.com",
    sender_display_name: "Alice",
    body_plain: "First message from Alice",
    body_html: null,
    snippet: "First message",
    received_at: "2026-06-01T10:00:00Z",
    is_origin: true,
  },
  {
    id: "msg-2",
    direction: "outbound",
    sender_external_id: "support@company.com",
    sender_display_name: "Support",
    body_plain: "Reply from agent",
    body_html: null,
    snippet: "Reply",
    received_at: "2026-06-01T10:05:00Z",
    is_origin: false,
  },
  {
    id: "msg-3",
    direction: "inbound",
    sender_external_id: "alice@example.com",
    sender_display_name: "Alice",
    body_plain: "Follow-up from Alice",
    body_html: null,
    snippet: "Follow-up",
    received_at: "2026-06-01T10:10:00Z",
    is_origin: false,
  },
];

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // Interpolation options (KAI-168 prioritySla.* keys) are an object, not a
    // string fallback — fall back to the raw key in that case so tests can
    // match on it.
    t: (key: string, fallback?: string | Record<string, unknown>) =>
      typeof fallback === "string" ? fallback : key,
    i18n: { language: "en" },
  }),
}));

let mockTicket: Record<string, unknown> = {
  id: "ticket-1",
  subject: "Test ticket",
  from_name: "Alice",
  from_email: "alice@example.com",
  received_at: "2026-06-01T10:00:00Z",
  body_plain: "Legacy body",
  snippet: null,
  ai_reasoning: null,
  status: "open",
  priority: null,
};

// KAI-168 defaults (P1 max_response_seconds=3600, etc.) — mirrors
// DEFAULT_PRIORITY_SLA_SECONDS in @kairo/types, needed since this mock
// ignores the zustand selector and always returns the whole state object.
const mockOperationalSlaConfig = {
  P1: { maxResponseSeconds: 3600, minResponseSeconds: 900, riskAlertSeconds: 1800, escalationSeconds: 2700 },
  P2: { maxResponseSeconds: 14400, minResponseSeconds: 1800, riskAlertSeconds: 10800, escalationSeconds: 12600 },
  P3: { maxResponseSeconds: 86400, minResponseSeconds: 3600, riskAlertSeconds: 64800, escalationSeconds: 79200 },
};

vi.mock("@/stores/triage-store", () => ({
  // Mirrors zustand's real selector API — PrioritySlaBar calls this with a
  // selector (`useTriageStore((s) => s.operationalSlaConfig)`) while
  // TicketDetail calls it with no args, so the mock must support both.
  useTriageStore: (selector?: (state: Record<string, unknown>) => unknown) => {
    const state = {
      tickets: [mockTicket],
      selectedTicketId: "ticket-1",
      operationalSlaConfig: mockOperationalSlaConfig,
    };
    return selector ? selector(state) : state;
  },
}));

vi.mock("./reply-bar", () => ({
  ReplyBar: () => React.createElement("div", { "data-testid": "reply-bar" }),
}));

vi.mock("./ticket-header", () => ({
  TicketHeader: () => React.createElement("div", { "data-testid": "ticket-header" }),
}));

// We mock useTicketThread directly — we test the hook separately
let mockThreadResult: { messages: typeof mockMessages | []; loading: boolean; error: string | null } = {
  messages: [],
  loading: false,
  error: null,
};

vi.mock("@/hooks/use-ticket-thread", () => ({
  useTicketThread: () => mockThreadResult,
}));

const { TicketDetail } = await import("./ticket-detail");

describe("TicketDetail", () => {
  beforeEach(() => {
    mockThreadResult = { messages: [], loading: false, error: null };
    mockTicket = {
      id: "ticket-1",
      subject: "Test ticket",
      from_name: "Alice",
      from_email: "alice@example.com",
      received_at: "2026-06-01T10:00:00Z",
      body_plain: "Legacy body",
      snippet: null,
      ai_reasoning: null,
      status: "open",
      priority: null,
    };
  });

  it("renders 3 message cards when thread has 3 messages", async () => {
    mockThreadResult = { messages: mockMessages, loading: false, error: null };
    renderWithProviders(React.createElement(TicketDetail));

    // Should render all 3 message bodies
    expect(screen.getByText("First message from Alice")).toBeInTheDocument();
    expect(screen.getByText("Reply from agent")).toBeInTheDocument();
    expect(screen.getByText("Follow-up from Alice")).toBeInTheDocument();
    // Initial message badge
    expect(screen.getByText("Initial message")).toBeInTheDocument();
  });

  it("renders messages in order (all 3 bodies present)", async () => {
    mockThreadResult = { messages: mockMessages, loading: false, error: null };
    const { container } = renderWithProviders(React.createElement(TicketDetail));

    // All three message bodies should be present in the rendered output
    const allText = container.textContent ?? "";
    expect(allText).toContain("First message from Alice");
    expect(allText).toContain("Reply from agent");
    expect(allText).toContain("Follow-up from Alice");
  });

  it("falls back to legacy body_plain when messages is empty (pre-backfill safety net)", () => {
    mockThreadResult = { messages: [], loading: false, error: null };
    renderWithProviders(React.createElement(TicketDetail));

    // Should show legacy body_plain from ticket store
    expect(screen.getByText("Legacy body")).toBeInTheDocument();
  });

  it("shows skeleton while loading", () => {
    mockThreadResult = { messages: [], loading: true, error: null };
    renderWithProviders(React.createElement(TicketDetail));

    // No message bodies while loading
    expect(screen.queryByText("First message from Alice")).not.toBeInTheDocument();
    expect(screen.queryByText("Legacy body")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// KAI-168: operational SLA progress bar below the subject
// ---------------------------------------------------------------------------

// Computed client-side from priority/received_at (tickets arrive raw from
// Supabase, never pre-enriched) — see computeTicketOperationalSla.
function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

describe("TicketDetail — priority SLA bar (KAI-168)", () => {
  beforeEach(() => {
    mockThreadResult = { messages: [], loading: false, error: null };
  });

  it("renders nothing when the ticket has no priority", () => {
    mockTicket = { ...mockTicket, priority: null };
    renderWithProviders(React.createElement(TicketDetail));
    expect(screen.queryByText(/restantes|remaining/i)).not.toBeInTheDocument();
  });

  it("shows remaining time text when under 50% of the priority's max response time", () => {
    // P1 max is 1h — 5 min elapsed is well under 50%.
    mockTicket = { ...mockTicket, priority: "P1", received_at: minutesAgo(5), first_response_at: null };
    renderWithProviders(React.createElement(TicketDetail));
    expect(screen.getByText(/prioritySla.detailRemaining/i)).toBeInTheDocument();
  });

  it("shows overdue text when past 100% of the priority's max response time", () => {
    // P1 max is 1h — 2h elapsed is 200%.
    mockTicket = { ...mockTicket, priority: "P1", received_at: minutesAgo(120), first_response_at: null };
    renderWithProviders(React.createElement(TicketDetail));
    expect(screen.getByText(/prioritySla.detailOverdue/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// KAI-25: read-only view for historical (resolved) tickets opened from the
// related-history drawer — no reply/note input for a ticket that's closed.
// ---------------------------------------------------------------------------

describe("TicketDetail — read-only historical view (KAI-25)", () => {
  beforeEach(() => {
    mockThreadResult = { messages: [], loading: false, error: null };
  });

  it("renders the ReplyBar for an active (open) ticket", () => {
    mockTicket = { ...mockTicket, status: "open" };
    renderWithProviders(React.createElement(TicketDetail));
    expect(screen.getByTestId("reply-bar")).toBeInTheDocument();
    expect(screen.queryByText("ticketDetail.readOnlyBanner")).not.toBeInTheDocument();
  });

  it("hides the ReplyBar and shows the read-only banner for a resolved ticket", () => {
    mockTicket = { ...mockTicket, status: "resolved" };
    renderWithProviders(React.createElement(TicketDetail));
    expect(screen.queryByTestId("reply-bar")).not.toBeInTheDocument();
    expect(screen.getByText("ticketDetail.readOnlyBanner")).toBeInTheDocument();
  });

  it("hides the ReplyBar and shows the read-only banner for an auto_resolved ticket", () => {
    mockTicket = { ...mockTicket, status: "auto_resolved" };
    renderWithProviders(React.createElement(TicketDetail));
    expect(screen.queryByTestId("reply-bar")).not.toBeInTheDocument();
    expect(screen.getByText("ticketDetail.readOnlyBanner")).toBeInTheDocument();
  });
});
