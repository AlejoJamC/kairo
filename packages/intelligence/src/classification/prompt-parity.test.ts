// ---------------------------------------------------------------------------
// KAI-45 F4 — the rubric is forked across languages, so hold the fork together.
//
// `es.md` and `en.md` are the same document written twice. Nothing has ever
// checked that, and a fork with no parity test drifts silently: a section added
// to one, a value renamed in the other, a version bumped on one side. The
// failure never shows up as an error — it shows up as one tenant classified
// against a rubric that answers a slightly different question.
//
// This does NOT check that the prose says the same thing; no test can. It
// checks the parts that are machine-readable and therefore have no excuse:
// section headings, the enum values each section offers, the placeholders the
// loader substitutes, and the version in the header. Each of those is a
// contract with code somewhere else in this package.
//
// `SUPPORTED_LANGS` drives the comparison, so adding `pt.md` to it makes this
// test start checking it with no edit here.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { SUPPORTED_LANGS, DEFAULT_LANG, type PromptLang } from './prompt';

const PROMPTS = join(dirname(fileURLToPath(import.meta.url)), '../../prompts/email-classification');

const read = (lang: PromptLang): string =>
  readFileSync(join(PROMPTS, `${lang}.md`), 'utf-8');

/** `## 2. subject_matter` → `2. subject_matter`, in file order. */
const sections = (text: string): string[] =>
  [...text.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]!.trim());

/** `{{body}}` → `body`, deduplicated and sorted. */
const placeholders = (text: string): string[] =>
  [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!))].sort();

/** The version in the h1, which `extractPromptVersion` reads at runtime. */
const version = (text: string): string | null =>
  text.match(/v(\d+\.\d+\.\d+)/)?.[1] ?? null;

/**
 * Every backticked identifier that is a value the model may return.
 *
 * Deliberately not "every backticked token": the rubric also quotes field names
 * and file paths. Anything matching `snake_case` or a known bare value is a
 * candidate, which over-collects a little and under-collects nothing — and an
 * over-collected token still has to appear in both files, which is the point.
 */
const values = (text: string): string[] =>
  [...new Set([...text.matchAll(/`([a-z][a-z0-9_]*)`/g)].map((m) => m[1]!))].sort();

const others = SUPPORTED_LANGS.filter((l) => l !== DEFAULT_LANG);

describe('rubric parity across languages', () => {
  it('has more than one language to compare, or this file is dead weight', () => {
    expect(others.length).toBeGreaterThan(0);
  });

  for (const lang of others) {
    describe(`${DEFAULT_LANG} vs ${lang}`, () => {
      const base = read(DEFAULT_LANG);
      const other = read(lang);

      // The section list is the rubric's table of contents and the order is the
      // order the model is asked to decide in. A section present in one file
      // and not the other is a field one tenant is never asked about.
      it('has the same sections, in the same order', () => {
        expect(sections(other)).toEqual(sections(base));
      });

      // A placeholder the loader does not substitute is rendered literally to
      // the model; one that a file stops using silently drops that input.
      it('substitutes the same placeholders', () => {
        expect(placeholders(other)).toEqual(placeholders(base));
      });

      // Both files are edited in the same commit or neither is. A version that
      // differs means one language shipped a change the other did not, and
      // `promptVersion` on a stored classification stops identifying a rubric.
      it('carries the same version', () => {
        expect(version(other)).toBe(version(base));
        expect(version(base)).not.toBeNull();
      });

      // The output contract is language-neutral by design (schema.ts). A value
      // that exists in one rubric and not the other is a class one tenant can
      // never be assigned.
      it('offers the same output values', () => {
        expect(values(other)).toEqual(values(base));
      });
    });
  }
});
