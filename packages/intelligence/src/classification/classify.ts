import { startObservation, propagateAttributes } from '@langfuse/tracing';
import { createCompletionProvider } from '../config/providers';
import { ModelVerdictSchema, type ClassificationResult } from './schema';
import { deriveClassification, provenanceOf } from './derive';
import { buildPrompt, getPromptVersion, type PromptLang, DEFAULT_LANG } from './prompt';
import type { EmailMessage } from './types';
import type { CompletionMeta, CompletionOptions } from '../providers/base';

/** Business identifiers to correlate a generation back to a ticket/tenant in Langfuse (KAI-189). */
export interface LangfuseContext {
  ticketId?: string;
  accountId?: string;
}

export interface ClassifyOptions extends Pick<CompletionOptions, 'temperature'> {
  lang?: PromptLang;
  /** KAI-189: when set, groups this generation into a per-ticket Langfuse trace. */
  context?: LangfuseContext;
}

/**
 * The provenance a caller with no headers gets: outside the company.
 *
 * Only the two fields `provenanceOf` reads matter on this path; the rest is
 * never consulted.
 */
const EXTERNAL_FALLBACK_FACTS = {
  senderIsTenantAddress: false,
  senderIsTenantDomain: false,
} as Parameters<typeof provenanceOf>[0];

export async function classifyEmail(
  message: EmailMessage,
  options?: ClassifyOptions,
): Promise<ClassificationResult> {
  const { result } = await classifyEmailWithMeta(message, options);
  return result;
}

/**
 * Like {@link classifyEmail}, but also surfaces provider metadata (raw text,
 * model, token usage) and the resolved prompt — for LLM observability
 * (KAI-110).
 */
export async function classifyEmailWithMeta(
  message: EmailMessage,
  options?: ClassifyOptions,
): Promise<{ result: ClassificationResult; meta: CompletionMeta; prompt: string; promptVersion: string | null }> {
  const provider = createCompletionProvider();
  const lang = options?.lang ?? DEFAULT_LANG;

  const prompt = await buildPrompt(message, lang);
  const promptVersion = await getPromptVersion(lang);
  const { ticketId, accountId } = options?.context ?? {};

  const run = async () => {
    // KAI-126: Langfuse generation trace. A no-op when LANGFUSE_* env vars are
    // unset (OTel API falls back to a no-op tracer), so this never blocks
    // classification.
    const generation = startObservation(
      'email-classification',
      {
        model: provider.model,
        input: prompt,
        metadata: { promptVersion, ...(ticketId ? { ticketId } : {}), ...(accountId ? { accountId } : {}) },
      },
      { asType: 'generation' },
    );

    try {
      const { data: verdict, ...meta } = await provider.completeJSONWithMeta(prompt, ModelVerdictSchema, {
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
      });

      // KAI-45 F2 — the model answered two orthogonal questions; the envelope
      // answered the third. `ticket_type` is the product of the three, looked
      // up in a table fitted to reproduce the human ground truth.
      //
      // `message.facts` is absent only on the three call sites that reclassify
      // a stored ticket and have no headers to read. They fall back to
      // `external`, which is what a ticket in the support queue almost always
      // is; stated here rather than hidden, so the day one of them starts
      // carrying facts this is where it is noticed.
      const data = deriveClassification(
        message.facts ?? EXTERNAL_FALLBACK_FACTS,
        {
          actionability: verdict.actionability,
          subjectMatter: verdict.subject_matter,
          priority: verdict.priority,
          tone: verdict.tone,
          urgency: verdict.urgency,
          reasoning: verdict.reasoning,
        },
        verdict.category,
        verdict.confidence,
      );

      const usageDetails: Record<string, number> = {};
      if (meta.usage.promptTokens != null) usageDetails.input = meta.usage.promptTokens;
      if (meta.usage.completionTokens != null) usageDetails.output = meta.usage.completionTokens;

      generation.update({
        output: meta.rawText,
        ...(Object.keys(usageDetails).length > 0 ? { usageDetails } : {}),
      });

      return { result: data, meta, prompt, promptVersion };
    } catch (err) {
      generation.update({ level: 'ERROR', statusMessage: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      generation.end();
    }
  };

  // KAI-189: groups this generation (and any siblings for the same ticket,
  // e.g. tier2/tier3 re-classification) into one Langfuse trace instead of an
  // orphan generation, so a ticket's full tier journey is visible as one story.
  if (ticketId || accountId) {
    return propagateAttributes(
      { ...(ticketId ? { sessionId: ticketId } : {}), ...(accountId ? { metadata: { accountId } } : {}) },
      run,
    );
  }
  return run();
}
