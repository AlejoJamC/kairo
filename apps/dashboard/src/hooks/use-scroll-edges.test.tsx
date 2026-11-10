import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useScrollEdges } from "./use-scroll-edges";

let observed: (() => void)[] = [];
beforeEach(() => {
  observed = [];
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { observed.push(callback); } observe() {} disconnect() {} });
});
afterEach(() => vi.unstubAllGlobals());

function area(sizes: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  const element = document.createElement("div");
  element.appendChild(document.createElement("div"));
  const state = { ...sizes };
  for (const key of ["scrollHeight", "clientHeight", "scrollTop"] as const) Object.defineProperty(element, key, { get: () => state[key], configurable: true });
  element.scrollTo = vi.fn() as never;
  return { element, state };
}
const measure = () => act(() => { observed.forEach((callback) => callback()); });

describe("useScrollEdges", () => {
  it("shows nothing for an area that does not overflow", () => {
    const { element } = area({ scrollHeight: 400, clientHeight: 400, scrollTop: 0 });
    const { result } = renderHook(() => useScrollEdges());
    act(() => result.current.attach(element));
    measure();
    expect(result.current.scrollable).toBe(false);
  });

  it("points down while there is content below and up at the end, and jumps to the matching edge", () => {
    const { element, state } = area({ scrollHeight: 1000, clientHeight: 400, scrollTop: 0 });
    const { result } = renderHook(() => useScrollEdges());
    act(() => result.current.attach(element));
    measure();
    expect(result.current).toMatchObject({ scrollable: true, direction: "down" });
    act(() => result.current.jump());
    expect(element.scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: expect.any(String) });

    state.scrollTop = 600;
    act(() => { element.dispatchEvent(new Event("scroll")); });
    expect(result.current.direction).toBe("up");
    act(() => result.current.jump());
    expect(element.scrollTo).toHaveBeenLastCalledWith({ top: 0, behavior: expect.any(String) });
  });

  it("follows the content when it grows", () => {
    const { element, state } = area({ scrollHeight: 400, clientHeight: 400, scrollTop: 0 });
    const { result } = renderHook(() => useScrollEdges());
    act(() => result.current.attach(element));
    measure();
    expect(result.current.scrollable).toBe(false);
    state.scrollHeight = 900;
    measure();
    expect(result.current.scrollable).toBe(true);
  });
});
