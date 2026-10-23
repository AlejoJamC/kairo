import { describe, expect, it } from "bun:test";
import { callbackPath, desktopHandoffUrl, handoffPath, desktopTarget, isDesktopDestination, readDesktopCookie, loopbackHandoffUrl, parsePort } from "./desktop-signin";

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

  it("carries the loopback port with the destination", () => {
    expect(callbackPath(true, 4010)).toBe("/auth/callback?destino=desktop&puerto=4010");
    expect(handoffPath(true, 4010)).toBe("/auth/handoff?destino=desktop&puerto=4010");
    expect(handoffPath(false, 4010)).toBe("/auth/handoff");
  });

  it("accepts only a numeric port between 1024 and 65535", () => {
    expect(parsePort("4010")).toBe(4010);
    expect(parsePort("65535")).toBe(65535);
    expect(parsePort("80")).toBeNull();
    expect(parsePort("70000")).toBeNull();
    expect(parsePort("4010/evil")).toBeNull();
    expect(parsePort("evil.com:80")).toBeNull();
    expect(parsePort(null)).toBeNull();
  });

  it("hands the session to 127.0.0.1 only", () => {
    expect(loopbackHandoffUrl(4010, { access_token: "a", refresh_token: "b" })).toBe("http://127.0.0.1:4010/auth?access_token=a&refresh_token=b");
  });

  it("prefers the running app's address and falls back to the kairo:// link", () => {
    const session = { access_token: "a", refresh_token: "b" };
    expect(desktopTarget(4010, session)).toBe("http://127.0.0.1:4010/auth?access_token=a&refresh_token=b");
    expect(desktopTarget(null, session)).toBe("kairo://auth?access_token=a&refresh_token=b");
  });

  it("reads the desktop sign-in from the cookie header", () => {
    expect(readDesktopCookie("a=1; kairo_desktop=4010; b=2")).toEqual({ desktop: true, port: 4010 });
    expect(readDesktopCookie("kairo_desktop=0")).toEqual({ desktop: true, port: null });
    expect(readDesktopCookie("a=1")).toEqual({ desktop: false, port: null });
    expect(readDesktopCookie(null)).toEqual({ desktop: false, port: null });
  });
});
