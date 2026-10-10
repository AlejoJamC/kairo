
import {
  stripQuotedThread,
  DEFAULT_LANG,
  SUPPORTED_LANGS,
  type EmailMessage,
  type PromptLang,
} from "@kairo/intelligence";

import {
  classifierContextAttributes,
  recordDecision,
  type ContextDegradation,
} from "./decision-telemetry.js";
import { type MailFacts } from "./email/mail-facts.js";
import { getGmailEmailByAccount } from "./gmail-token.js";
import { supabase } from "./supabase.js";
import { findRelevantKb } from './ticket-context.js';

export type ClassifierStage = "onboarding" | "backfill" | "new_email";

export interface ClassifierBodyRule {
  maxChars: number;
  stripQuotes: boolean;
}

export const CLASSIFIER_BODY_RULES: Record<ClassifierStage, ClassifierBodyRule> = {
  onboarding: { maxChars: 20_000, stripQuotes: false },
  backfill: { maxChars: 2_000, stripQuotes: true },
  new_email: { maxChars: 2_000, stripQuotes: true },
};


export function buildClassifierBody(
  stage: ClassifierStage,
  bodyPlain: string | null | undefined,
  snippet: string | null | undefined = ""
): string {
  const rule = CLASSIFIER_BODY_RULES[stage];
  const raw = bodyPlain || snippet || "";
  return (rule.stripQuotes ? stripQuotedThread(raw) : raw).slice(0, rule.maxChars);
}


export function classifierEnvelope(
  facts: MailFacts
): Pick<EmailMessage, "to" | "cc" | "threadDepth"> {
  return {
    ...(facts.toHeader ? { to: facts.toHeader } : {}),
    ...(facts.ccHeader ? { cc: facts.ccHeader } : {}),
    threadDepth: facts.referencesCount,
  };
}

/** Build the same evidence contract for jobs and interactive tools. */
export function buildEmailClassifierInput(input: {
  stage: NonNullable<EmailMessage['stage']>;
  subject: string;
  from: string;
  bodyPlain: string | null | undefined;
  snippet?: string;
  facts: MailFacts;
  context: Pick<ClassifierContext, 'tenantMailbox' | 'tenantMailboxes' | 'businessContext'>;
  bodySource?: 'full' | 'stored';
  missing?: string[];
}): EmailMessage {
  const ruleStage = input.stage === 'manual' ? 'backfill' : input.stage;
  const raw = input.bodyPlain || input.snippet || '';
  const prepared = CLASSIFIER_BODY_RULES[ruleStage].stripQuotes ? stripQuotedThread(raw) : raw;
  return {
    subject: input.subject, from: input.from,
    body: prepared.slice(0, CLASSIFIER_BODY_RULES[ruleStage].maxChars),
    tenantMailbox: input.context.tenantMailbox,
    ...(input.context.businessContext ? { businessContext: input.context.businessContext } : {}),
    ...classifierEnvelope(input.facts),
    facts: input.facts,
    stage: input.stage,
    evidence: {
      bodySource: input.bodyPlain ? input.bodySource ?? 'full' : 'snippet',
      truncated: prepared.length > CLASSIFIER_BODY_RULES[ruleStage].maxChars,
      missing: [...new Set([...(input.missing ?? []), ...(input.bodyPlain ? [] : ['full_body']),
        ...(input.context.tenantMailbox ? [] : ['tenant_mailbox']),
        ...(input.stage === 'onboarding' || input.context.businessContext ? [] : ['business_context'])])],
    },
  };
}


function unionMailboxes(primary: string, channels: string[]): string[] {
  return [...new Set([primary, ...channels].map((m) => m.trim().toLowerCase()).filter(Boolean))];
}

export interface ClassifierContext {

  stage?: ClassifierStage;
  tenantMailbox: string;

  language: PromptLang;

  tenantMailboxes: string[];

  businessContext?: string;
}


async function readTenantMailboxes(
  accountId: string,
  degradations: ContextDegradation[]
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("support_channels")
      .select("email_address")
      .eq("account_id", accountId)
      .eq("is_active", true);

    if (error) {
      console.warn('[classifier-input] Support channel context unavailable');
      degradations.push("support_channels_unreadable");
      return [];
    }
    return (data ?? [])
      .map((r) => (r.email_address as string | null | undefined)?.trim() ?? "")
      .filter((a) => a !== "");
  } catch {
    console.warn('[classifier-input] Support channel context unavailable');
    degradations.push("support_channels_unreadable");
    return [];
  }
}


export interface AccountSettings {
  language: PromptLang;
  businessContext: string | undefined;
}


async function readAccountSettings(
  accountId: string,
  degradations: ContextDegradation[],
  db = supabase,
): Promise<AccountSettings> {
  const fallback: AccountSettings = { language: DEFAULT_LANG, businessContext: undefined };
  try {
    const { data, error } = await db
      .from("accounts")
      .select("language, business_context")
      .eq("id", accountId)
      .maybeSingle();

    if (error) {
      console.warn('[classifier-input] Account context unavailable');
      degradations.push("accounts_unreadable");
      return fallback;
    }

    const raw = (data?.language as string | null | undefined)?.trim().toLowerCase();
    const language = SUPPORTED_LANGS.includes(raw as PromptLang) ? (raw as PromptLang) : DEFAULT_LANG;
    if (raw && language !== raw) {
      console.warn('[classifier-input] Unsupported language; using configured fallback');
      degradations.push("unsupported_language");
    }

    const text = (data?.business_context as string | null | undefined)?.trim();
    return { language, businessContext: text ? text : undefined };
  } catch {
    console.warn('[classifier-input] Account context unavailable');
    degradations.push("accounts_unreadable");
    return fallback;
  }
}

export async function resolveTenantSettings(accountId: string, db = supabase): Promise<AccountSettings> {
  return readAccountSettings(accountId, [], db);
}

export async function withApprovedKnowledge(
  message: EmailMessage,
  accountId: string,
  retrieve: typeof findRelevantKb = findRelevantKb,
): Promise<EmailMessage> {
  const knowledge = await retrieve({ accountId, queryText: [message.subject, message.body.slice(0, 2000)].join('\n') });
  const missing = [...(message.evidence?.missing ?? []), ...(knowledge.degraded.length ? ['approved_knowledge'] : [])];
  return {
    ...message,
    ...(knowledge.articles.length ? { businessContext: JSON.stringify({
      configuredBusinessContext: message.businessContext ?? null,
      publishedKnowledge: knowledge.articles.map(article => ({ id: article.id, title: article.title, content: article.content.slice(0, 2000) })),
      knowledgeContext: { role: 'published_reference_data', conflictsRequireHumanReview: true },
    }) } : {}),
    ...(message.evidence ? { evidence: { ...message.evidence, missing: [...new Set(missing)] } } : {}),
  };
}


export async function resolveTenantLanguage(accountId: string): Promise<PromptLang> {
  const { language } = await readAccountSettings(accountId, []);
  return language;
}


export async function resolveClassifierContext(
  stage: ClassifierStage,
  accountId: string
): Promise<ClassifierContext> {
  const degradations: ContextDegradation[] = [];
  const [tenantMailbox, channels, settings] = await Promise.all([
    getGmailEmailByAccount(accountId),
    readTenantMailboxes(accountId, degradations),
    readAccountSettings(accountId, degradations),
  ]);

  const base = {
    tenantMailbox,
    tenantMailboxes: unionMailboxes(tenantMailbox, channels),
    language: settings.language,
  };
  const context: ClassifierContext =
    stage === "onboarding"
      ? base
      : { ...base, ...(settings.businessContext ? { businessContext: settings.businessContext } : {}) };

  recordDecision(
    "classifier.context",
    classifierContextAttributes(stage, accountId, context),
    degradations.map((name) => ({ name }))
  );
  return context;
}
