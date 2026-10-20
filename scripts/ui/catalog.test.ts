import { describe, expect, it } from "bun:test";
import { buildCatalog, exportsOf, purposeOf } from "./catalog";

describe("catalog helpers", () => {
  it("reads the first paragraph of the purpose", () => {
    expect(purposeOf("# x\n\n## Purpose\n\nTriggers an\naction.\n\nSecond.\n\n## Variants\n")).toBe("Triggers an action.");
  });

  it("lists value exports and skips types", () => {
    const source = "export { Button, IconButton }\nexport type { ButtonProps }\nexport { Inner as Outer, type Only }\nexport function helper() {}\nexport const VALUE = 1";
    expect(exportsOf(source)).toEqual(["Button", "IconButton", "Outer", "VALUE", "helper"]);
  });
});

describe("buildCatalog", () => {
  const catalog = buildCatalog();

  it("marks implemented and specified pieces", () => {
    expect(catalog).toMatch(/\| `button` \| implemented \| .*`Button`/);
    expect(catalog).toMatch(/\| `command-palette` \| implemented \| .*`CommandPalette`/);
    expect(catalog).toMatch(/\| `login` \| specified \|/);
  });

  it("covers components, blocks and templates", () => {
    for (const title of ["## Components", "## Blocks", "## Templates"]) expect(catalog).toContain(title);
  });

  it("reports no export without a specification", () => {
    expect(catalog).toContain("## Exports without a specification\n\nNone.");
  });
});
