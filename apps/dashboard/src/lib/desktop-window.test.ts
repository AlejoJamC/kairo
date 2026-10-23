import { describe, expect, it } from "vitest";
import { appWindowMinWidth, appWindowWidth } from "./desktop-window";

describe("desktop window size", () => {
  it("fits the sidebar, the ticket list, the center column and the context panel", () => {
    expect(appWindowMinWidth(false)).toBe(232 + 372 + 520 + 344);
  });

  it("needs less width when the sidebar is collapsed", () => {
    expect(appWindowMinWidth(true)).toBe(60 + 372 + 520 + 344);
  });

  it("opens wider than the minimum", () => {
    expect(appWindowWidth()).toBeGreaterThan(appWindowMinWidth(false));
  });
});
