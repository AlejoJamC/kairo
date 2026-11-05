import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSidebarCounts } from "./use-sidebar-counts";
import { useNoteCounts } from "./use-note-counts";
import { useTriageStore } from "../stores/triage-store";

const getSidebarCounts = vi.fn();

// The realtime channel the sidebar listens on: `emit` plays a change of the account's tickets.
type Change = { eventType?: string; old?: { status?: string | null }; new?: { status?: string | null } };
let onChange: ((payload: Change) => void) | undefined;
const channel = {
  on: vi.fn((_type: string, _filter: unknown, callback: (payload: Change) => void) => {
    onChange = callback;
    return channel;
  }),
  subscribe: vi.fn(() => channel),
};
const removeChannel = vi.fn();
vi.mock("../supabase", () => ({ createClient: () => ({ channel: () => channel, removeChannel }) }));
const session: { user: { id: string } | null; accountId: string | null } = { user: { id: "u1" }, accountId: "a1" };
vi.mock("../auth", () => ({ useAuth: () => session }));
const getNoteCounts = vi.fn();

vi.mock("../endpoints", () => ({
  getSidebarCounts: () => getSidebarCounts(),
  getNoteCounts: () => getNoteCounts(),
}));

const ok = (body: unknown) => ({ ok: true, json: async () => body });

beforeEach(() => {
  onChange = undefined;
  session.user = { id: "u1" };
  session.accountId = "a1";
  channel.on.mockClear();
  channel.subscribe.mockClear();
  removeChannel.mockClear();
  getSidebarCounts.mockReset();
  getNoteCounts.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useSidebarCounts", () => {
  it("is null until the first answer, then holds the counts", async () => {
    getSidebarCounts.mockResolvedValue(ok({ new: 3 }));
    const { result } = renderHook(() => useSidebarCounts(60));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual({ new: 3 }));
  });

  it("keeps the last counts when a poll fails", async () => {
    getSidebarCounts.mockResolvedValueOnce(ok({ new: 3 })).mockRejectedValue(new Error("offline"));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useSidebarCounts(5));
    await waitFor(() => expect(result.current).toEqual({ new: 3 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(getSidebarCounts).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({ new: 3 });
  });

  it("polls at the given interval and stops on unmount", async () => {
    getSidebarCounts.mockResolvedValue(ok({}));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { unmount } = renderHook(() => useSidebarCounts(10));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getSidebarCounts).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(getSidebarCounts).toHaveBeenCalledTimes(2);
  });
});

describe("useSidebarCounts — realtime", () => {
  it("listens to the tickets of the account", () => {
    getSidebarCounts.mockResolvedValue(ok({}));
    renderHook(() => useSidebarCounts(60));
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      { event: "*", schema: "public", table: "tickets", filter: "account_id=eq.a1" },
      expect.any(Function),
    );
    expect(channel.subscribe).toHaveBeenCalled();
  });

  it("reads the counts again right after a change, without waiting for the poll", async () => {
    getSidebarCounts.mockResolvedValueOnce(ok({ open: 1 })).mockResolvedValue(ok({ open: 18 }));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useSidebarCounts(3600));
    await waitFor(() => expect(result.current).toEqual({ open: 1 }));
    act(() => onChange?.({ eventType: "INSERT", new: { status: "open" } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(getSidebarCounts).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({ open: 18 });
  });

  it("reads once for a burst of changes", async () => {
    getSidebarCounts.mockResolvedValue(ok({}));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderHook(() => useSidebarCounts(3600));
    await vi.waitFor(() => expect(getSidebarCounts).toHaveBeenCalledTimes(1));
    act(() => {
      for (let i = 0; i < 17; i++) onChange?.({ eventType: "INSERT", new: { status: "open" } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(getSidebarCounts).toHaveBeenCalledTimes(2);
  });

  it("ignores an update that leaves the ticket in the same status", async () => {
    getSidebarCounts.mockResolvedValue(ok({}));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderHook(() => useSidebarCounts(3600));
    await vi.waitFor(() => expect(getSidebarCounts).toHaveBeenCalledTimes(1));
    act(() => onChange?.({ eventType: "UPDATE", old: { status: "open" }, new: { status: "open" } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(getSidebarCounts).toHaveBeenCalledTimes(1);
  });

  it("reads again when an update moves the ticket to another status", async () => {
    getSidebarCounts.mockResolvedValue(ok({}));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderHook(() => useSidebarCounts(3600));
    await vi.waitFor(() => expect(getSidebarCounts).toHaveBeenCalledTimes(1));
    act(() => onChange?.({ eventType: "UPDATE", old: { status: "open" }, new: { status: "resolved" } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(getSidebarCounts).toHaveBeenCalledTimes(2);
  });

  it("reads again on an update when the previous row is not sent", async () => {
    getSidebarCounts.mockResolvedValue(ok({}));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderHook(() => useSidebarCounts(3600));
    await vi.waitFor(() => expect(getSidebarCounts).toHaveBeenCalledTimes(1));
    act(() => onChange?.({ eventType: "UPDATE", old: {}, new: { status: "open" } }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(getSidebarCounts).toHaveBeenCalledTimes(2);
  });

  it("does not listen while disabled or signed out, and leaves the channel on unmount", () => {
    getSidebarCounts.mockResolvedValue(ok({}));
    renderHook(() => useSidebarCounts(60, false));
    session.user = null;
    renderHook(() => useSidebarCounts(60));
    expect(channel.subscribe).not.toHaveBeenCalled();
    session.user = { id: "u1" };
    const { unmount } = renderHook(() => useSidebarCounts(60));
    unmount();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });
});

describe("useNoteCounts", () => {
  it("does nothing while disabled", () => {
    renderHook(() => useNoteCounts(false, 30));
    expect(getNoteCounts).not.toHaveBeenCalled();
  });

  it("loads the counters into the triage store when enabled", async () => {
    const counts = { "t-1": { notes: 2, unread_mentions: 1 } };
    getNoteCounts.mockResolvedValue(ok({ data: counts }));
    renderHook(() => useNoteCounts(true, 30));
    await waitFor(() => expect(useTriageStore.getState().noteCounts).toEqual(counts));
  });

  it("falls back to empty counters on a non-ok response", async () => {
    getNoteCounts.mockResolvedValue({ ok: false, json: async () => ({}) });
    renderHook(() => useNoteCounts(true, 30));
    await waitFor(() => expect(getNoteCounts).toHaveBeenCalled());
    await waitFor(() => expect(useTriageStore.getState().noteCounts).toEqual({}));
  });
});
