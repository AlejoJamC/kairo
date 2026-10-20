import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generate } from "./generate.ts";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "generated");
const { css, ts } = generate();
const files: [string, string][] = [
  [join(OUT, "tokens.css"), css],
  [join(OUT, "tokens.ts"), ts],
];

if (process.argv.includes("--check")) {
  const drifted = files.filter(([path, content]) => !existsSync(path) || readFileSync(path, "utf8") !== content);
  if (drifted.length > 0) {
    console.error(`Generated tokens are out of date: ${drifted.map(([p]) => p).join(", ")}. Run \`bun run build\` in packages/tokens.`);
    process.exit(1);
  }
  console.log("Generated tokens are in sync.");
} else {
  for (const [path, content] of files) writeFileSync(path, content);
  console.log(`Wrote ${files.length} files.`);
}
