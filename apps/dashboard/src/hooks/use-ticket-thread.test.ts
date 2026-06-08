import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useTicketThread, type ThreadMessage } from "./use-ticket-thread";

// ---------------------------------------------------------------------------
// KAI-165: useTicketThread hook tests
// ---------------------------------------------------------------------------

const apiCallMock = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiCall: (...args: unknown[]) => apiCallMock(...args),
}));

const MOCK_MESSAGES = [
  {
    id: "msg-1",
    direction: "inbound",
    sender_external_id: "alice@example.com",
    sender_display_name: "Alice",
    body_plain: "Hello, I need help",
    body_html: null,
    snippet: "Hello, I need help",
    received_at: "2026-06-01T10:00:00Z",
    is_origin: true,
  },
  {
    id: "msg-2",
    direction: "outbound",
    sender_external_id: "support@company.com",
    sender_display_name: "Support",
    body_plain: "Hi Alice, happy to help!",
    body_html: null,
    snippet: "Hi Alice, happy to help!",
    received_at: "2026-06-01T10:05:00Z",
    is_origin: false,
  },
  {
    id: "msg-3",
    direction: "inbound",
    sender_external_id: "alice@example.com",
    sender_display_name: "Alice",
    body_plain: "Thanks!",
    body_html: null,
    snippet: "Thanks!",
    received_at: "2026-06-01T10:10:00Z",
    is_origin: false,
  },
];

describe("useTicketThread", () => {
  beforeEach(() => {
    apiCallMock.mockReset();
  });

  it("returns empty state initially and fetches messages on ticketId", async () => {
    apiCallMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: MOCK_MESSAGES, count: MOCK_MESSAGES.length }),
    });

    const { result } = renderHook(() => useTicketThread("ticket-1"));

    expect(result.current.loading).toBe(true);
    expect(result.current.messages).toHaveLength(0);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages[0].is_origin).toBe(true);
    expect(result.current.error).toBeNull();
    expect(apiCallMock).toHaveBeenCalledWith("/api/v1/tickets/ticket-1/messages");
  });

  it("returns empty messages array when ticketId is null", () => {
    const { result } = renderHook(() => useTicketThread(null));
    expect(result.current.loading).toBe(false);
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.error).toBeNull();
    expect(apiCallMock).not.toHaveBeenCalled();
  });

  it("sets error on non-ok response", async () => {
    apiCallMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => "Ticket not found",
    });

    const { result } = renderHook(() => useTicketThread("ticket-missing"));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBeTruthy();
    expect(result.current.messages).toHaveLength(0);
  });

  it("refetches when ticketId changes", async () => {
    const msg1 = [{ ...MOCK_MESSAGES[0] }];
    const msg2 = [{ ...MOCK_MESSAGES[1] }];

    apiCallMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: msg1, count: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ messages: msg2, count: 1 }) });

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useTicketThread(id),
      { initialProps: { id: "ticket-a" } }
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages).toHaveLength(1);

    rerender({ id: "ticket-b" });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages).toHaveLength(1);
    expect(apiCallMock).toHaveBeenCalledTimes(2);
  });

  it("appendOptimisticMessage appends a queued message to the local thread (KAI-114 outbox)", async () => {
    apiCallMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [MOCK_MESSAGES[0]], count: 1 }),
    });

    const { result } = renderHook(() => useTicketThread("ticket-1"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages).toHaveLength(1);

    const optimistic: ThreadMessage = {
      id: "msg-queued-1",
      direction: "outbound",
      sender_external_id: "agent@kairo.dev",
      sender_display_name: "agent@kairo.dev",
      body_plain: "On it, thanks for your patience!",
      body_html: null,
      snippet: "On it, thanks for your patience!",
      received_at: "2026-06-07T12:00:00Z",
      is_origin: false,
      delivery_status: "queued",
    };

    act(() => result.current.appendOptimisticMessage(optimistic));

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1]).toEqual(optimistic);
  });
});
