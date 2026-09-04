import { startObservation, propagateAttributes } from '@langfuse/tracing';
import { createCompletionProvider } from '../config/providers';
import { ClassificationSchema, type ClassificationResult } from './schema';
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
      const { data, ...meta } = await provider.completeJSONWithMeta(prompt, ClassificationSchema, {
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
      });

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
