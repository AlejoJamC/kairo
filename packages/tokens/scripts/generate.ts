import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

type TokenValue = string | number | TokenValue[] | { [key: string]: TokenValue };
interface Token {
  $type?: string;
  $value: TokenValue;
  /** Per-theme overrides: "kairo.dark" replaces $value in the dark theme. */
  $extensions?: { "kairo.dark"?: TokenValue };
}
type TokenTree = { [key: string]: TokenTree | Token | string };

export type ResolvedValue = string | number | { [key: string]: string | number };
export type ResolvedTokens = Record<string, ResolvedValue>;

const isToken = (node: unknown): node is Token =>
  typeof node === "object" && node !== null && "$value" in node;

function flatten(tree: TokenTree, prefix = "", out: Record<string, Token> = {}): Record<string, Token> {
  for (const [key, node] of Object.entries(tree)) {
    if (key.startsWith("$")) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (isToken(node)) out[path] = node;
    else if (typeof node === "object") flatten(node as TokenTree, path, out);
  }
  return out;
}

const REFERENCE = /\{([^}]+)\}/g;

function readTree(name: string): TokenTree {
  return JSON.parse(readFileSync(join(ROOT, "src", name), "utf8")) as TokenTree;
}

function cssFontFamily(families: TokenValue[]): string {
  return families.map((f) => (/\s/.test(String(f)) ? `"${f}"` : String(f))).join(", ");
}

function shadowToCss(shadow: { [key: string]: TokenValue }): string {
  return `${shadow.offsetX} ${shadow.offsetY} ${shadow.blur} ${shadow.spread} ${shadow.color}`;
}

type Theme = "light" | "dark";

/** Resolves every token to its final value for one theme: strings, numbers or one level of composite fields. */
function resolveTheme(all: Record<string, Token>, theme: Theme): ResolvedTokens {
  const cache = new Map<string, ResolvedValue>();

  function resolveString(value: string, from: string, trail: string[]): string {
    return value.replace(REFERENCE, (_match, ref: string) => {
      const target = resolveToken(ref, trail.concat(from));
      if (typeof target !== "string" && typeof target !== "number") {
        throw new Error(`${from}: reference {${ref}} points to a composite token inside a string`);
      }
      return String(target);
    });
  }

  function resolveToken(path: string, trail: string[]): ResolvedValue {
    const cached = cache.get(path);
    if (cached !== undefined) return cached;
    if (trail.includes(path)) throw new Error(`Circular reference: ${[...trail, path].join(" -> ")}`);
    const token = all[path];
    if (!token) throw new Error(`Unresolved reference: ${path} (from ${trail[trail.length - 1] ?? "root"})`);

    const value = (theme === "dark" ? token.$extensions?.["kairo.dark"] : undefined) ?? token.$value;
    let resolved: ResolvedValue;
    if (token.$type === "shadow" && value === "none") {
      resolved = "none";
    } else if (token.$type === "fontFamily" && Array.isArray(value)) {
      resolved = cssFontFamily(value);
    } else if (token.$type === "shadow") {
      const layers = (Array.isArray(value) ? value : [value]) as { [key: string]: TokenValue }[];
      resolved = layers
        .map((layer) =>
          shadowToCss(
            Object.fromEntries(
              Object.entries(layer).map(([k, v]) => [k, typeof v === "string" ? resolveString(v, path, trail) : v]),
            ),
          ),
        )
        .join(", ");
    } else if (typeof value === "string") {
      resolved = resolveString(value, path, trail);
    } else if (typeof value === "number") {
      resolved = value;
    } else if (typeof value === "object" && !Array.isArray(value)) {
      resolved = Object.fromEntries(
        Object.entries(value).map(([k, v]) => {
          if (typeof v === "string") {
            const whole = /^\{([^}]+)\}$/.exec(v);
            if (whole) {
              const target = resolveToken(whole[1], trail.concat(path));
              return [k, typeof target === "object" ? JSON.stringify(target) : target];
            }
            return [k, resolveString(v, path, trail)];
          }
          return [k, v as number];
        }),
      ) as { [key: string]: string | number };
    } else {
      throw new Error(`${path}: unsupported token value`);
    }
    cache.set(path, resolved);
    return resolved;
  }

  const resolved: ResolvedTokens = {};
  for (const path of Object.keys(all)) resolved[path] = resolveToken(path, []);
  return resolved;
}

const cssName = (path: string) => `--kairo-${path.replace(/\./g, "-")}`;

/** One CSS declaration per variable: composite tokens expand into one variable per field. */
function cssDeclarations(resolved: ResolvedTokens): Map<string, string> {
  const lines = new Map<string, string>();
  for (const [path, value] of Object.entries(resolved)) {
    if (typeof value === "object") {
      for (const [field, v] of Object.entries(value)) {
        lines.set(`${cssName(path)}-${field.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`, String(v));
      }
    } else {
      lines.set(cssName(path), String(value));
    }
  }
  return lines;
}

/** Resolves every token to its final value, for the light theme and for the dark one. */
export function generate(): { resolved: ResolvedTokens; dark: ResolvedTokens; css: string; ts: string } {
  const all = { ...flatten(readTree("core.json")), ...flatten(readTree("semantic.json")) };
  const resolved = resolveTheme(all, "light");
  const darkAll = resolveTheme(all, "dark");

  // Only what the dark theme changes: the rest keeps its light value.
  const dark: ResolvedTokens = {};
  for (const [path, value] of Object.entries(darkAll)) {
    if (JSON.stringify(value) !== JSON.stringify(resolved[path])) dark[path] = value;
  }

  const lightLines = cssDeclarations(resolved);
  const darkLines = cssDeclarations(dark);
  const block = (selector: string, lines: Map<string, string>) =>
    `${selector} {\n${[...lines].map(([name, value]) => `  ${name}: ${value};`).join("\n")}\n}\n`;
  const css = `/* Generated by scripts/build.ts from src/*.json. Do not edit. */\n${block(":root, [data-theme=\"light\"]", lightLines)}${block("[data-theme=\"dark\"]", darkLines)}`;
  const ts = `// Generated by scripts/build.ts from src/*.json. Do not edit.\nexport const tokens = ${JSON.stringify(resolved, null, 2)} as const;\n\nexport type TokenName = keyof typeof tokens;\n\n/** The tokens the dark theme changes; every other token keeps its light value. */\nexport const darkTokens = ${JSON.stringify(dark, null, 2)} as const;\n`;
  return { resolved, dark, css, ts };
}
