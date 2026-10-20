import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { useActiveView } from "./useActiveView";

const at = (path: string) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
  };

describe("useActiveView", () => {
  it("reads the view from the URL", () => {
    const { result } = renderHook(() => useActiveView(), { wrapper: at("/settings/channels") });
    expect(result.current[0]).toBe("channels");
  });

  it("is null for a path that is no view", () => {
    const { result } = renderHook(() => useActiveView(), { wrapper: at("/missing") });
    expect(result.current[0]).toBeNull();
  });

  it("navigates to another view", () => {
    const { result } = renderHook(() => ({ view: useActiveView(), location: useLocation() }), { wrapper: at("/") });
    expect(result.current.view[0]).toBe("triage");
    act(() => result.current.view[1]("clients"));
    expect(result.current.location.pathname).toBe("/clients");
    expect(result.current.view[0]).toBe("clients");
  });
});
