import { describe, expect, it } from "bun:test";
import { checkBoundaries } from "./check-boundaries";

const run = (path: string, content: string) => checkBoundaries([{ path, content }]);

describe("checkBoundaries", () => {
  it("accepts allowed imports", () => {
    expect(run("apps/dashboard/src/a.ts", `import { x } from "@kairo/ui"; import y from "@kairo/client-core/config";`)).toEqual([]);
    expect(run("packages/ui/src/a.tsx", `import { tokens } from "@kairo/tokens";`)).toEqual([]);
    expect(run("packages/client-core/src/a.ts", `import { Database } from "@kairo/types";`)).toEqual([]);
  });

  it("rejects a package importing an app", () => {
    const [v] = run("packages/client-core/src/a.ts", `import { x } from "@kairo/dashboard/foo";`);
    expect(v?.rule).toBe("packages never import apps");
  });

  it("rejects a relative import into an app from a package", () => {
    expect(run("packages/ui/src/a.ts", `import x from "../../../apps/dashboard/src/x";`).length).toBeGreaterThan(0);
  });

  it("rejects an app importing another app but not itself", () => {
    expect(run("apps/dashboard/src/a.ts", `import x from "@kairo/landing/x";`).map((v) => v.rule)).toEqual(["apps never import other apps"]);
    expect(run("apps/landing/app/a.ts", `import x from "../../kelan/x"; import z from "../../../apps/kelan/x";`).length).toBe(1);
    expect(run("apps/dashboard/src/a.ts", `import x from "@/components/y";`)).toEqual([]);
  });

  it("keeps @kairo/ui away from client-core, supabase and intelligence", () => {
    for (const spec of ["@kairo/client-core", "@kairo/client-core/config", "@supabase/supabase-js", "@kairo/intelligence"]) {
      expect(run("packages/ui/src/a.tsx", `import x from "${spec}";`).length).toBe(1);
    }
  });

  it("keeps tokens free of workspace dependencies", () => {
    expect(run("packages/tokens/src/a.ts", `import x from "@kairo/types";`).length).toBe(1);
  });

  it("keeps client-core free of UI", () => {
    for (const spec of ["@kairo/ui", "react-dom", "@tamagui/core"]) {
      expect(run("packages/client-core/src/a.ts", `import x from "${spec}";`).length).toBe(1);
    }
  });

  it("reads dynamic imports, re-exports and require", () => {
    const source = `export * from "@kairo/client-core"; const a = await import("@supabase/supabase-js"); const b = require("@kairo/intelligence");`;
    expect(run("packages/ui/src/a.ts", source).length).toBe(3);
  });
});
