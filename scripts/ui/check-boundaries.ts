/**
 * Package boundary check.
 *
 * Fails when a package or app imports something its layer must not reach.
 * Run with `bun run ui:boundaries`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface SourceFile {
  /** Path relative to the repository root, with forward slashes. */
  path: string;
  content: string;
}

export interface Violation {
  path: string;
  specifier: string;
  rule: string;
}

const APPS = ["dashboard", "landing", "kelan", "mobile", "api"];

interface Rule {
  name: string;
  appliesTo: (path: string) => boolean;
  forbids: (specifier: string, path: string) => boolean;
}

const owner = (path: string): string | null => /^apps\/([^/]+)\//.exec(path)?.[1] ?? null;
const startsWithPackage = (specifier: string, name: string) => specifier === name || specifier.startsWith(`${name}/`);

const RULES: Rule[] = [
  {
    name: "packages never import apps",
    appliesTo: (p) => p.startsWith("packages/"),
    forbids: (s) =>
      APPS.some((app) => startsWithPackage(s, `@kairo/${app}`)) || /(^|\/)apps\/[^/]+/.test(s),
  },
  {
    name: "apps never import other apps",
    appliesTo: (p) => p.startsWith("apps/"),
    forbids: (s, p) => {
      const self = owner(p);
      return (
        APPS.some((app) => app !== self && startsWithPackage(s, `@kairo/${app}`)) ||
        APPS.some((app) => app !== self && new RegExp(`(^|/)apps/${app}(/|$)`).test(s))
      );
    },
  },
  {
    name: "@kairo/ui does not reach data, auth or intelligence",
    appliesTo: (p) => p.startsWith("packages/ui/src/"),
    forbids: (s) =>
      ["@kairo/client-core", "@kairo/intelligence", "@kairo/observability", "@kairo/identity", "@supabase/supabase-js"].some(
        (name) => startsWithPackage(s, name),
      ),
  },
  {
    name: "@kairo/tokens depends on no workspace package",
    appliesTo: (p) => p.startsWith("packages/tokens/src/"),
    forbids: (s) => s.startsWith("@kairo/"),
  },
  {
    name: "@kairo/client-core has no UI",
    appliesTo: (p) => p.startsWith("packages/client-core/src/"),
    forbids: (s) =>
      startsWithPackage(s, "@kairo/ui") || startsWithPackage(s, "react-dom") || s.startsWith("@tamagui/"),
  },
];

const IMPORT = /(?:from\s+|import\s*\(\s*|require\(\s*)["']([^"']+)["']/g;

export function checkBoundaries(files: SourceFile[]): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    const rules = RULES.filter((rule) => rule.appliesTo(file.path));
    if (rules.length === 0) continue;
    for (const match of file.content.matchAll(IMPORT)) {
      const specifier = match[1]!;
      for (const rule of rules) {
        if (rule.forbids(specifier, file.path)) violations.push({ path: file.path, specifier, rule: rule.name });
      }
    }
  }
  return violations;
}

const SKIP_DIRS = new Set(["node_modules", ".next", "out", "dist", ".turbo", ".tamagui", "coverage", ".expo"]);

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..", "..");
  const files = [...walk(join(root, "apps")), ...walk(join(root, "packages"))].map((full) => ({
    path: relative(root, full).split("\\").join("/"),
    content: readFileSync(full, "utf8"),
  }));
  const violations = checkBoundaries(files);
  if (violations.length === 0) {
    console.log("Package boundaries: no violations.");
  } else {
    for (const v of violations) console.error(`${v.path}: imports "${v.specifier}" (${v.rule})`);
    console.error(`\n${violations.length} boundary violation(s).`);
    process.exit(1);
  }
}
