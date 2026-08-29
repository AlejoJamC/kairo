// ---------------------------------------------------------------------------
// KAI-93 — one definition of what reaches the classifier.
//
// The body rule used to be a magic number copied into every call site, and the
// copies drifted. Four production paths ended up sending a body that no eval
// stage had ever measured, and none of them sent `tenantMailbox` — the input
// that moved macro F1 between +0.035 and +0.129 on every model in the matrix,
// and that separates `support` from `internal` in the rubric.
//
// This module is the single place that decides, so a new call site cannot
// invent a fifth regime by accident. The two stage names are the ones the eval
// uses (scripts/eval/lib/run-label.ts), so a measured cell and a production
// path can be named the same thing.
// ---------------------------------------------------------------------------

import { stripQuotedThread } from "@kairo/intelligence";

export type ClassifierStage = "onboarding" | "backfill";

export interface ClassifierBodyRule {
  maxChars: number;
  stripQuotes: boolean;
}

export const CLASSIFIER_BODY_RULES: Record<ClassifierStage, ClassifierBodyRule> = {
  // Tier 1 only: the onboarding fast-path — FAST_PATH_SCAN_SIZE (default 30)
  // messages, once per account, fired from the connect-Gmail wizard. Nothing
  // else triggers pipeline/tier1.triggered, so this is a low-volume, one-time
  // cost per signup, and getting the very first ticket right matters more here
  // than trimming it. The body arrives raw, quoted thread intact.
  //
  // The cap is a safety valve against a pathological input, not a trim of
  // normal correspondence (KAI-181): extractBody() only walks text/plain and
  // text/html MIME parts, so an email's attachments never reach this string
  // regardless of the raw .eml size on disk — measured on the KAI-93 corpus,
  // an 8.8MB email (mostly embedded images) extracted to 12,090 characters of
  // text. The largest real body across that corpus was 18,380 characters. This
  // cap sits just above that (real content never gets cut) and exists only to
  // stop something like a pasted log file or a MIME-parsing bug from reaching
  // the model — every local model handles 20k+ token prompts without
  // truncating, so this is not a context-window limit either.
  onboarding: { maxChars: 20_000, stripQuotes: false },

  // Every other path: tier 2, tier 3, incremental-sync, the reclassify
  // endpoints and the Gmail poll. The accumulated quote is stripped first, so
  // these 2,000 characters are the new text of the message rather than the
  // tail of the thread — the cap only fires when stripQuotedThread (KAI-181)
  // leaves something abnormally long, since new text on this corpus has a
  // measured p90 of ~1,900 characters. No user is waiting on any of these.
  backfill: { maxChars: 2_000, stripQuotes: true },
};

/**
 * The body to hand the classifier for a given stage.
 *
 * `snippet` is the fallback for mail that carried only HTML or no decodable
 * text part — the same precedence every tier already used.
 */
export function buildClassifierBody(
  stage: ClassifierStage,
  bodyPlain: string | null | undefined,
  snippet: string | null | undefined = ""
): string {
  const rule = CLASSIFIER_BODY_RULES[stage];
  const raw = bodyPlain || snippet || "";
  return (rule.stripQuotes ? stripQuotedThread(raw) : raw).slice(0, rule.maxChars);
}
