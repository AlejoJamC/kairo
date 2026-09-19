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

import { stripQuotedThread, type EmailMessage } from "@kairo/intelligence";

import { type MailFacts } from "./email/mail-facts.js";
import { getGmailEmailByAccount } from "./gmail-token.js";
import { supabase } from "./supabase.js";

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

// ---------------------------------------------------------------------------
// The tenant context that travels with the body.
//
// `tenantMailbox` and `businessContext` are the two fields the rubric points at
// when it separates `support` from `internal`, and they are resolved together
// because a call site that forgets one of them is exactly the drift this module
// exists to stop.
//
// The stage decides whether the business context is sent at all — it is not an
// argument the caller gets to pass. That is the whole point of routing this
// through here.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The envelope fields, from the facts the pre-filter already read.
//
// `EmailMessage` has carried `to`, `cc` and `threadDepth` since the rubric
// started saying `internal` is not decidable without them — and not one of the
// seven call sites ever populated a single one. Every production classification
// so far has rendered `Para: (no disponible)`, `Copia: (no disponible)`,
// `Mensajes previos en el hilo: (no disponible)`, while the headers that answer
// all three sat in the same function that decided whether to classify at all.
//
// Lives here rather than at each call site for the reason in this module's
// header: five paths that each assemble classifier input by hand is how the
// four regimes this file exists to collapse came about in the first place.
// ---------------------------------------------------------------------------

/**
 * The recipient and thread fields to hand the classifier, from a
 * {@link MailFacts} produced by `preFilterEmail`.
 *
 * A header that did not arrive is omitted rather than sent as an empty string:
 * the prompt renders an omitted field as `(no disponible)` and tells the model
 * not to invent it, which is true, whereas an empty `Para:` reads as a message
 * with no recipients.
 */
export function classifierEnvelope(
  facts: MailFacts
): Pick<EmailMessage, "to" | "cc" | "threadDepth"> {
  return {
    ...(facts.toHeader ? { to: facts.toHeader } : {}),
    ...(facts.ccHeader ? { cc: facts.ccHeader } : {}),
    // `References` lists every ancestor, so its length is how many messages
    // precede this one. Absent header means this message opens the thread —
    // which is a known 0, not an unknown, so it is always sent.
    threadDepth: facts.referencesCount,
  };
}

export interface ClassifierContext {
  /** The mailbox Kairo is reading. Sent by every stage. */
  tenantMailbox: string;
  /**
   * What the tenant's company does. Absent on `onboarding`, and absent on
   * `backfill` until the account has one — the rubric then renders
   * `(no disponible)` and classifies without it.
   */
  businessContext?: string;
}

/**
 * Reads `accounts.business_context`.
 *
 * Never throws: a classification is worth more without the context than not at
 * all, and this column is read on every backfill call. The most likely failure
 * is also the most benign one — an environment where the migration adding the
 * column has not been applied yet.
 */
async function readBusinessContext(accountId: string): Promise<string | undefined> {
  try {
    const { data, error } = await supabase
      .from("accounts")
      .select("business_context")
      .eq("id", accountId)
      .maybeSingle();

    if (error) {
      console.warn(`[classifier-input] business_context unreadable for account ${accountId}: ${error.message}`);
      return undefined;
    }

    const text = (data?.business_context as string | null | undefined)?.trim();
    return text ? text : undefined;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[classifier-input] business_context unreadable for account ${accountId}: ${message}`);
    return undefined;
  }
}

/**
 * The tenant fields to hand the classifier for a given stage.
 *
 * Resolve this once per batch — per Inngest step, per poll, per request — and
 * reuse it for every email in that batch, the way the tenant mailbox already
 * was. It is per-account state, not per-email state.
 *
 * On `onboarding` the business context is not even read. Tier 1 runs before any
 * value could exist, and the KAI-93 bench measured the field as actively
 * harmful in that column: the best onboarding model lost 0.073 macro F1 with it
 * and none of the five gained. `backfill` is the opposite case — a median gain
 * of +0.082 across the same five models — so once a value exists, every
 * non-Tier-1 call from that moment on carries it.
 */
export async function resolveClassifierContext(
  stage: ClassifierStage,
  accountId: string
): Promise<ClassifierContext> {
  if (stage === "onboarding") {
    return { tenantMailbox: await getGmailEmailByAccount(accountId) };
  }

  const [tenantMailbox, businessContext] = await Promise.all([
    getGmailEmailByAccount(accountId),
    readBusinessContext(accountId),
  ]);

  return { tenantMailbox, ...(businessContext ? { businessContext } : {}) };
}
