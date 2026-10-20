import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// A caller that builds its status list inline passes a new array on every
// render; the list must not be fetched again for it.

const order = vi.fn(async () => ({ data: [], error: null }));
const query = { select: vi.fn(() => query), in: vi.fn(() => query), eq: vi.fn(() => query), order };
const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };

vi.mock("../supabase", () => ({
  createClient: () => ({ from: () => query, channel: () => channel, removeChannel: vi.fn() }),
}));
const session = { user: { id: "u1" }, accountId: "a1" };
vi.mock("../auth", () => ({ useAuth: () => session }));

import { useStatusTickets } from "./use-status-tickets";

describe("useStatusTickets", () => {
  beforeEach(() => order.mockClear());

  it("does not refetch when the status array is a new instance with the same values", async () => {
    const { rerender } = renderHook(() => useStatusTickets({ channelPrefix: "x", statuses: ["awaiting_customer"], orderBy: "sla_due_at", ascending: true }));
    await vi.waitFor(() => expect(order).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(order).toHaveBeenCalledTimes(1);
  });
});
