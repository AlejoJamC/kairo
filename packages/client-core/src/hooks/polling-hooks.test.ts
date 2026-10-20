import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSidebarCounts } from "./use-sidebar-counts";
import { useNoteCounts } from "./use-note-counts";
import { useTriageStore } from "../stores/triage-store";

const getSidebarCounts = vi.fn();
const getNoteCounts = vi.fn();

vi.mock("../endpoints", () => ({
  getSidebarCounts: () => getSidebarCounts(),
  getNoteCounts: () => getNoteCounts(),
}));

const ok = (body: unknown) => ({ ok: true, json: async () => body });

beforeEach(() => {
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
