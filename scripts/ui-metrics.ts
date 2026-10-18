/**
 * UI architecture metrics.
 *
 * Measures how far the client apps are from consuming the shared UI layers.
 * Run with `bun run ui:metrics`; add `--json` for machine-readable output.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const SKIP_DIRS = new Set(["node_modules", ".next", "out", "dist", ".turbo", "public", ".tamagui", "coverage"]);
const CLIENT_APPS = ["dashboard", "landing", "kelan", "mobile"];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const isTest = (f: string) => /\.(test|spec)\.[tj]sx?$/.test(f) || f.includes("/__tests__/");
const read = (f: string) => readFileSync(f, "utf8");
const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

const HEX = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
const INLINE_STYLE = /style=\{\{/g;
const COMPONENT_DEF = /^(?:export\s+)?(?:default\s+)?function\s+([A-Z][A-Za-z0-9]*)\s*\(/gm;

interface AppMetrics {
  app: string;
  tsxFiles: number;
  filesImportingKairoUi: number;
  inlineStyles: number;
  hexLiterals: number;
  viewFilesCallingApiOrSupabase: number;
}

const apps: AppMetrics[] = [];
const definitions = new Map<string, Set<string>>();

for (const app of CLIENT_APPS) {
  const files = walk(join(ROOT, "apps", app)).filter((f) => /\.tsx$/.test(f) && !isTest(f));
  const m: AppMetrics = {
    app,
    tsxFiles: files.length,
    filesImportingKairoUi: 0,
    inlineStyles: 0,
    hexLiterals: 0,
    viewFilesCallingApiOrSupabase: 0,
  };
  for (const f of files) {
    const text = read(f);
    if (/from\s+["']@kairo\/ui["']/.test(text)) m.filesImportingKairoUi++;
    m.inlineStyles += count(text, INLINE_STYLE);
    m.hexLiterals += count(text, HEX);
    if (/\/components\//.test(f) && /@kairo\/client-core\/(api-client|supabase)|@supabase\/supabase-js/.test(text)) {
      m.viewFilesCallingApiOrSupabase++;
    }
    for (const match of text.matchAll(COMPONENT_DEF)) {
      const set = definitions.get(match[1]) ?? new Set<string>();
      set.add(relative(ROOT, f));
      definitions.set(match[1], set);
    }
  }
  apps.push(m);
}

const duplicatedComponents = [...definitions.entries()]
  .filter(([, files]) => files.size > 1)
  .map(([name, files]) => ({ name, files: [...files] }));

const tokenSources = [
  ...walk(join(ROOT, "apps")).concat(walk(join(ROOT, "packages"))).filter((f) => f.endsWith(".css") && count(read(f), /^\s*--[a-z0-9-]+\s*:/gm) >= 10),
  ...["packages/ui/tamagui.config.ts", "packages/ui/src/triage-tokens.ts"].map((f) => join(ROOT, f)).filter(existsSync),
].map((f) => relative(ROOT, f));

const uiExports = existsSync(join(ROOT, "packages/ui/src/index.ts"))
  ? count(read(join(ROOT, "packages/ui/src/index.ts")), /^export \* from/gm)
  : 0;
const specDir = join(ROOT, "packages/ui/spec");
const specFiles = existsSync(specDir) ? walk(specDir).filter((f) => f.endsWith(".md")).length : 0;

const report = {
  tokenSources: { count: tokenSources.length, target: 1, files: tokenSources },
  tokensPackagePresent: existsSync(join(ROOT, "packages/tokens")),
  uiModulesExported: uiExports,
  uiSpecFiles: specFiles,
  apps,
  duplicatedComponentNames: duplicatedComponents,
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Token sources: ${report.tokenSources.count} (target 1)`);
  for (const f of tokenSources) console.log(`  ${f}`);
  console.log(`packages/tokens present: ${report.tokensPackagePresent}`);
  console.log(`packages/ui modules exported: ${uiExports}, spec files: ${specFiles}`);
  console.log("");
  console.log("app        tsx  importUi  style={{}}  hex  viewsCallingApi");
  for (const a of apps) {
    console.log(
      `${a.app.padEnd(10)} ${String(a.tsxFiles).padStart(3)}  ${String(a.filesImportingKairoUi).padStart(8)}  ${String(a.inlineStyles).padStart(10)}  ${String(a.hexLiterals).padStart(3)}  ${String(a.viewFilesCallingApiOrSupabase).padStart(14)}`
    );
  }
  console.log("");
  console.log(`Component names defined in more than one file: ${duplicatedComponents.length}`);
  for (const d of duplicatedComponents) console.log(`  ${d.name}: ${d.files.join(", ")}`);
}
