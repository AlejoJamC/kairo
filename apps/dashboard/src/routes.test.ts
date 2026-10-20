import { describe, expect, it } from "vitest";
import type { AppView } from "@/types";
import { VIEW_PATHS, pathForView, viewForPath } from "./routes";

const VIEWS = Object.keys(VIEW_PATHS) as AppView[];

describe("routes", () => {
  it("gives every view its own path", () => {
    expect(new Set(Object.values(VIEW_PATHS)).size).toBe(VIEWS.length);
  });

  it.each(VIEWS)("maps %s to a path and back", (view) => {
    expect(viewForPath(pathForView(view))).toBe(view);
  });

  it("ignores a trailing slash", () => {
    expect(viewForPath("/clients/")).toBe("clients");
    expect(viewForPath("/")).toBe("triage");
  });

  it("returns null for an unknown path", () => {
    expect(viewForPath("/nope")).toBeNull();
    expect(viewForPath("/settings/unknown")).toBeNull();
  });
});
