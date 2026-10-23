import { describe, expect, it } from "bun:test";
import { callbackPath, desktopHandoffUrl, handoffPath, isDesktopDestination } from "./desktop-signin";

describe("desktop sign-in", () => {
  it("recognizes only the desktop destination", () => {
    expect(isDesktopDestination("desktop")).toBe(true);
    expect(isDesktopDestination("web")).toBe(false);
    expect(isDesktopDestination(null)).toBe(false);
  });

  it("keeps the destination in the callback and hand-off addresses", () => {
    expect(callbackPath(true)).toBe("/auth/callback?destino=desktop");
    expect(callbackPath(false)).toBe("/auth/callback");
    expect(handoffPath(true)).toBe("/auth/handoff?destino=desktop");
    expect(handoffPath(false)).toBe("/auth/handoff");
  });

  it("builds the kairo:// link with both tokens encoded", () => {
    expect(desktopHandoffUrl({ access_token: "a+b", refresh_token: "c/d" })).toBe("kairo://auth?access_token=a%2Bb&refresh_token=c%2Fd");
  });
});
