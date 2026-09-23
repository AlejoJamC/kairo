#!/usr/bin/env bun
/**
 * Checks LLM-feature code against the rules of the kairo-llm-feature Skill.
 *
 *   bun skills/kairo-llm-feature/scripts/check-llm-feature.ts <file-or-dir>...
 *   bun skills/kairo-llm-feature/scripts/check-llm-feature.ts --all
 *
 * Pass the files of the feature being built or changed. `--all` scans
 * apps/ and packages/ and also reports pre-existing debt.
 * Prints `path:line  rule  message` per violation; exits 1 if any.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { basename, dirname, extname, join, relative, resolve } from "path";

export interface Violation {
  file: string;
  line: number;
  rule: string;
  message: string;
}

interface LineRule {
  rule: string;
  message: string;
  /** Which files the rule applies to (repo-relative, forward slashes). */
  appliesTo: (file: string) => boolean;
  pattern: RegExp;
}

const isApp = (f: string) => f.startsWith("apps/");
const isTest = (f: string) => /\.test\.tsx?$/.test(f);
const isAppCode = (f: string) => isApp(f) && !isTest(f);

// Each rule is one step of the Skill, and each names the fix.
const LINE_RULES: LineRule[] = [
  {
    rule: "regex-json",
    message: "JSON extracted with a regex over model text — use a Zod schema with runLlmFeature / completeJSONWithMeta (step 4)",
    appliesTo: (f) => !isTest(f),
    pattern: /\.match\(\s*\/\\\{\[\\s\\S\]\*\\\}\//,
  },
  {
    rule: "raw-provider-call",
    message: "model called directly from the app — call runLlmFeature (or classifyEmailWithMeta) so the prompt, schema, Langfuse and llm_calls come with it (step 7)",
    appliesTo: isAppCode,
    pattern: /\.(complete|completeJSON|completeWithMeta|completeJSONWithMeta)\(/,
  },
  {
    rule: "inline-prompt-load",
    message: "prompt file read outside packages/intelligence — load it through runLlmFeature / loadPromptTemplate (step 3)",
    appliesTo: isAppCode,
    pattern: /(readFileSync|readFile)\([^)]*prompts/,
  },
  {
    rule: "raw-langfuse",
    message: "Langfuse generation opened by hand — runLlmFeature / withGeneration already groups it under sessionId = ticketId (step 9)",
    appliesTo: isAppCode,
    pattern: /\bstartObservation\(/,
  },
  {
    rule: "hardcoded-model",
    message: "stored model id is not the model that answered — store the provider-reported model (result.model / meta.model) (step 8)",
    appliesTo: (f) => !isTest(f),
    // Stored as a column or passed on to one (history rows take `modelVersion`).
    // `model: resolveModelVersion()` on an llm_calls failure row is allowed:
    // no provider answered, so there is no reported model to store.
    pattern: /(model_version|modelVersion)\s*:\s*resolveModelVersion\(\)|const\s+\w+\s*=\s*resolveModelVersion\(\)/,
  },
  {
    rule: "language-guess",
    message: "language guessed from the text — use the tenant's language (resolveTenantLanguage) (step 5)",
    appliesTo: (f) => !isTest(f),
    pattern: /function\s+detectLanguage\b/,
  },
  {
    rule: "direct-llm-calls-insert",
    message: "llm_calls written outside lib/llm-logging.ts — use logLlmCall or the recordLlmCall logger (step 7)",
    appliesTo: (f) => isAppCode(f) && !f.endsWith("lib/llm-logging.ts"),
    pattern: /from\(\s*["']llm_calls["']\s*\)\s*\.insert/,
  },
];

/** Line-level rules over one file. `file` is repo-relative. */
export function checkSource(file: string, text: string): Violation[] {
  const out: Violation[] = [];
  const lines = text.split("\n");
  for (const r of LINE_RULES) {
    if (!r.appliesTo(file)) continue;
    lines.forEach((line, i) => {
      if (r.pattern.test(line)) out.push({ file, line: i + 1, rule: r.rule, message: r.message });
    });
  }
  return out;
}

// Functions only: a copied function is the defect; a local value that shares a
// name with an export (a client, a fixture) is not.
const DECLARED = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)|^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/gm;
const EXPORTED = /export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g;

/**
 * A test that declares its own copy of a function its sibling module exports
 * tests the copy, not the code (step 13).
 */
export function checkTestCopies(testFile: string, testText: string, siblingSources: Record<string, string>): Violation[] {
  const exported = new Map<string, string>();
  for (const [file, text] of Object.entries(siblingSources)) {
    for (const m of text.matchAll(EXPORTED)) exported.set(m[1]!, file);
  }
  const out: Violation[] = [];
  for (const m of testText.matchAll(DECLARED)) {
    const name = m[1] ?? m[2]!;
    const source = exported.get(name);
    if (!source) continue;
    const imported = new RegExp(`import[^;]*\\b${name}\\b[^;]*from`).test(testText);
    if (imported) continue;
    const line = testText.slice(0, m.index).split("\n").length;
    out.push({
      file: testFile,
      line,
      rule: "test-copy",
      message: `redefines \`${name}\`, which ${basename(source)} exports — import the real one (step 13)`,
    });
  }
  return out;
}

/** Every prompt directory has one file per supported language, each with a version heading (step 3). */
export function checkPromptDirs(promptsRoot: string, langs: readonly string[]): Violation[] {
  const out: Violation[] = [];
  if (!existsSync(promptsRoot)) return out;
  for (const id of readdirSync(promptsRoot)) {
    const dir = join(promptsRoot, id);
    if (!statSync(dir).isDirectory()) continue;
    for (const lang of langs) {
      const file = join(dir, `${lang}.md`);
      const rel = relative(process.cwd(), file);
      if (!existsSync(file)) {
        out.push({ file: rel, line: 1, rule: "prompt-lang-missing", message: `prompt ${id} has no ${lang}.md` });
        continue;
      }
      const first = readFileSync(file, "utf-8").split("\n", 1)[0] ?? "";
      if (!/v\d+\.\d+\.\d+/.test(first)) {
        out.push({ file: rel, line: 1, rule: "prompt-version-missing", message: `first heading carries no vX.Y.Z version` });
      }
    }
  }
  return out;
}

const SKIP_DIRS = new Set(["node_modules", "dist", ".next", "out", ".turbo", "data"]);

function collect(path: string, acc: string[]): void {
  if (!existsSync(path)) return;
  if (statSync(path).isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
      collect(join(path, entry), acc);
    }
  } else if ([".ts", ".tsx"].includes(extname(path)) && !path.endsWith(".d.ts")) {
    acc.push(path);
  }
}

function repoRoot(): string {
  let dir = resolve(dirname(new URL(import.meta.url).pathname));
  while (!existsSync(join(dir, "turbo.json")) && dirname(dir) !== dir) dir = dirname(dir);
  return dir;
}

export function run(args: string[]): Violation[] {
  const root = repoRoot();
  const targets = args.includes("--all") ? [join(root, "apps"), join(root, "packages")] : args.map((a) => resolve(a));
  const files: string[] = [];
  for (const t of targets) collect(t, files);

  const violations: Violation[] = [];
  for (const abs of files) {
    const rel = relative(root, abs).split("\\").join("/");
    const text = readFileSync(abs, "utf-8");
    violations.push(...checkSource(rel, text));
    if (isTest(rel)) {
      const dir = dirname(abs);
      const siblings: Record<string, string> = {};
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) && statSync(p).isFile()) siblings[entry] = readFileSync(p, "utf-8");
      }
      violations.push(...checkTestCopies(rel, text, siblings));
    }
  }
  violations.push(...checkPromptDirs(join(root, "packages/intelligence/prompts"), ["es", "en"]));
  return violations;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("usage: check-llm-feature.ts <file-or-dir>... | --all");
    process.exit(2);
  }
  const violations = run(args);
  for (const v of violations) console.log(`${v.file}:${v.line}  ${v.rule}  ${v.message}`);
  console.log(violations.length === 0 ? "OK — no violations" : `${violations.length} violation(s)`);
  process.exit(violations.length === 0 ? 0 : 1);
}
