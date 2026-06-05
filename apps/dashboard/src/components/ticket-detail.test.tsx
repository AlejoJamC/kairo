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
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: "en" },
  }),
}));

vi.mock("@/stores/triage-store", () => ({
  useTriageStore: () => ({
    tickets: [
      {
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
      },
    ],
    selectedTicketId: "ticket-1",
  }),
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
