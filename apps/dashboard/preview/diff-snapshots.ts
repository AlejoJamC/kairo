// Compares two directories of layout snapshots: `bun preview/diff-snapshots.ts <before> <after>`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ElementSnapshot } from "./capture";

const [before, after] = process.argv.slice(2);
if (!before || !after) throw new Error("usage: diff-snapshots <before-dir> <after-dir>");

const TOLERANCE = 0.6;
let total = 0;

for (const file of readdirSync(before).filter((f) => f.endsWith(".json")).sort()) {
  const a: ElementSnapshot[] = JSON.parse(readFileSync(join(before, file), "utf8"));
  let b: ElementSnapshot[];
  try {
    b = JSON.parse(readFileSync(join(after, file), "utf8"));
  } catch {
    console.log(`${file}: missing in ${after}`);
    continue;
  }
  // Align the two element lists (wrappers may be added or removed) by tag and text.
  const key = (e: ElementSnapshot) => `${e.tag}|${e.text}|${Math.round(e.rect[2] / 6)}|${Math.round(e.rect[3] / 6)}`;
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i]![j] = key(a[i]!) === key(b[j]!) ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const pairs: Array<[number, number]> = [];
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (key(a[i]!) === key(b[j]!)) { pairs.push([i, j]); i++; j++; }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++;
    else j++;
  }
  const unmatchedBefore = a.length - pairs.length;
  const unmatchedAfter = b.length - pairs.length;
  const lines: string[] = [];
  pairs.forEach(([i, j]) => {
    const x = a[i]!;
    const y = b[j]!;
    const where = `#${i} <${x.tag}>${x.text ? ` "${x.text}"` : ""}`;
    const rectDiff = x.rect.some((v, k) => Math.abs(v - y.rect[k]!) > TOLERANCE);
    if (x.tag !== y.tag) lines.push(`  ${where}: tag ${x.tag} -> ${y.tag}`);
    if (rectDiff) lines.push(`  ${where}: rect [${x.rect.join(", ")}] -> [${y.rect.join(", ")}]`);
    for (const key of Object.keys(x.style)) {
      const norm = (v: string) => ((key === "alignItems" || key === "alignSelf") && v === "normal" ? "stretch" : v);
      if (norm(x.style[key]!) === norm(y.style[key]!)) continue;
      if (key === "opacity") continue;
      if (key === "whiteSpace") continue; // nested Text inherits it; no visible effect
      const side = /^border(Top|Right|Bottom|Left)(Style|Color)$/.exec(key);
      if (side && x.style[`border${side[1]}Width`] === "0px" && y.style[`border${side[1]}Width`] === "0px") continue; // animations make opacity a moving target
      if (x.style[key] !== y.style[key]) lines.push(`  ${where}: ${key} ${x.style[key]} -> ${y.style[key]}`);
    }
  });
  total += lines.length;
  console.log(`${file}: ${a.length} -> ${b.length} elements (${unmatchedBefore} removed, ${unmatchedAfter} added), ${lines.length} differences`);
  for (const line of lines.slice(0, Number(process.env.DIFF_LIMIT ?? 40))) console.log(line);
}
process.exit(total === 0 ? 0 : 1);
