import { describe, expect, it, vi } from "vitest";
import { backoffDelay, retryWithBackoff } from "../retry";

describe("backoffDelay", () => {
  it("doubles each retry up to the cap", () => {
    expect([1, 2, 3, 4, 5].map((retry) => backoffDelay(retry, 1000, 5000))).toEqual([1000, 2000, 4000, 5000, 5000]);
  });
});

describe("retryWithBackoff", () => {
  it("returns at once when the task succeeds", async () => {
    const task = vi.fn().mockResolvedValue("ok");
    const sleep = vi.fn();
    expect(await retryWithBackoff(task, { sleep })).toBe("ok");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a failure with growing waits and stops at the first success", async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error("a")).mockRejectedValueOnce(new Error("b")).mockResolvedValue("ok");
    const waits: number[] = [];
    const result = await retryWithBackoff(task, { baseMs: 1000, jitter: 0, sleep: async (ms) => { waits.push(ms); } });
    expect(result).toBe("ok");
    expect(task).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([1000, 2000]);
  });

  it("adds jitter on top of each wait, never below it", async () => {
    const task = vi.fn().mockRejectedValueOnce(new Error("a")).mockResolvedValue("ok");
    const waits: number[] = [];
    await retryWithBackoff(task, { baseMs: 1000, jitter: 0.2, random: () => 0.5, sleep: async (ms) => { waits.push(ms); } });
    expect(waits).toEqual([1100]);
  });

  it("throws the last error when the tries are spent, without waiting after the last one", async () => {
    const task = vi.fn().mockRejectedValue(new Error("down"));
    const waits: number[] = [];
    await expect(retryWithBackoff(task, { attempts: 3, jitter: 0, sleep: async (ms) => { waits.push(ms); } })).rejects.toThrow("down");
    expect(task).toHaveBeenCalledTimes(3);
    expect(waits).toHaveLength(2);
  });
});
