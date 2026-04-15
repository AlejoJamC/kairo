/**
 * i18n Translation Key Validator
 *
 * Checks that all translation files across all languages have the same keys.
 * Run: bun scripts/validate-i18n.ts
 *
 * Exit code 0 = all good, 1 = missing keys found.
 * Suitable for CI pipelines.
 */

import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

const RESOURCES_DIR = join(import.meta.dir, "../src/i18n/resources");
const REFERENCE_LANG = "en";

function getKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      return getKeys(value as Record<string, unknown>, fullKey);
    }
    return [fullKey];
  });
}

function run() {
  const languages = readdirSync(RESOURCES_DIR).filter((f) =>
    existsSync(join(RESOURCES_DIR, f))
  );

  const refDir = join(RESOURCES_DIR, REFERENCE_LANG);
  const namespaces = readdirSync(refDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));

  let hasErrors = false;

  for (const ns of namespaces) {
    const refFile = join(refDir, `${ns}.json`);
    const refContent = JSON.parse(readFileSync(refFile, "utf-8"));
    const refKeys = new Set(getKeys(refContent));

    for (const lang of languages) {
      if (lang === REFERENCE_LANG) continue;

      const langFile = join(RESOURCES_DIR, lang, `${ns}.json`);

      if (!existsSync(langFile)) {
        console.error(`MISSING FILE: ${lang}/${ns}.json`);
        hasErrors = true;
        continue;
      }

      const langContent = JSON.parse(readFileSync(langFile, "utf-8"));
      const langKeys = new Set(getKeys(langContent));

      // Keys in reference but not in this language
      for (const key of refKeys) {
        if (!langKeys.has(key)) {
          console.error(`MISSING KEY: [${lang}/${ns}] "${key}"`);
          hasErrors = true;
        }
      }

      // Extra keys in this language not in reference
      for (const key of langKeys) {
        if (!refKeys.has(key)) {
          console.warn(`EXTRA KEY:   [${lang}/${ns}] "${key}"`);
        }
      }
    }
  }

  if (hasErrors) {
    console.error("\ni18n validation FAILED — missing keys detected.");
    process.exit(1);
  } else {
    console.log("i18n validation PASSED — all keys present across languages.");
    process.exit(0);
  }
}

run();
