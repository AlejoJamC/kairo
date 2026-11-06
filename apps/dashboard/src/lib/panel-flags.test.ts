import { describe, it, expect, vi, afterEach } from "vitest";

const NAMES = {
  WORK_QUEUE_ENABLED: "VITE_FF_ENABLE_WORK_QUEUE",
  SUPERPOWERS_ENABLED: "VITE_FF_ENABLE_SUPERPOWERS",
  NOTES_TAB_ENABLED: "VITE_FF_ENABLE_NOTES_TAB",
  RELATED_HISTORY_DRAWER_ENABLED: "VITE_FF_ENABLE_RELATED_HISTORY_DRAWER",
  CONTACT_DETAIL_DRAWER_ENABLED: "VITE_FF_ENABLE_CONTACT_DETAIL_DRAWER",
} as const;

async function load(): Promise<Record<string, boolean>> {
  vi.resetModules();
  return (await import("./panel-flags")) as Record<string, boolean>;
}

afterEach(() => vi.unstubAllEnvs());

describe("panel flags", () => {
  it.each(Object.keys(NAMES))("%s is off when its variable is unset", async (constant) => {
    expect((await load())[constant]).toBe(false);
  });

  it.each(Object.entries(NAMES))("%s is on only for the exact string true", async (constant, variable) => {
    vi.stubEnv(variable, "true");
    expect((await load())[constant]).toBe(true);
    vi.stubEnv(variable, "TRUE");
    expect((await load())[constant]).toBe(false);
  });
});
