import { usesDecisionClassification } from '../config/model-roles';
import { createCompletionProvider, createDecisionProvider } from '../config/providers';
import { resolveEnsembleTarget } from '../config/ensemble';
import { ModelVerdictSchema, type ClassificationResult, type ModelVerdictResult } from './schema';
import { deriveClassification, provenanceOf, EXTERNAL_FALLBACK_FACTS } from './derive';
import { buildPrompt, getPromptVersion, type PromptLang, DEFAULT_LANG } from './prompt';
import { generationResultMetadata, generationStartMetadata } from './telemetry';
import { TICKET_QUESTIONS_VERSION, buildTicketVerdictQuestions } from './decision-questions';
import { classifyEmailWithDecision, stateFromMessage } from './classify-with-decision';
import { z } from 'zod';
import type { EmailMessage } from './types';
import type { TicketType } from '@kairo/types';
import type { CompletionMeta, CompletionOptions } from '../providers/base';
import { usageDetails, withGeneration, type LangfuseContext } from '../harness/generation';

export type { LangfuseContext };

export interface ClassifyOptions extends Pick<CompletionOptions, 'temperature' | 'abortSignal'> {
  lang?: PromptLang;
  /** KAI-189: when set, groups this generation into a per-ticket Langfuse trace. */
  context?: LangfuseContext;
}

export { EXTERNAL_FALLBACK_FACTS };

export async function classifyEmail(
  message: EmailMessage,
  options?: ClassifyOptions,
): Promise<ClassificationResult> {
  const { result } = await classifyEmailWithMeta(message, options);
  return result;
}

interface ClassifyEmailWithMetaResult {
  result: ClassificationResult;
  /**
   * What the model actually answered, before the table turned it into a type.
   *
   * Returned rather than kept inside because `result.type` is the product of
   * three coordinates and a wrong one is unattributable without them: an eval
   * that sees only the type cannot tell a model that picked the wrong axis from
   * a table cell that cannot reach the label at all. Those are different
   * defects with different fixes, and scripts/eval/run_layered_eval.ts
   * separates them from this field.
   */
  verdict: ModelVerdictResult;
  /**
   * The ensemble disagreed: a second model, asked the same prompt, derived a
   * different `ticket_type`. The classification is still returned — it is the
   * primary's — but it must not be auto-approved. Callers route it to the
   * human queue.
   *
   * Always false when no ensemble is configured, or when the second model
   * failed: an opinion that never arrived is not a disagreement.
   */
  abstain: boolean;
  /** What the second model derived, or null when it was not asked or failed. */
  ensemble: { model: string; type: TicketType } | null;
  meta: CompletionMeta;
  prompt: string;
  promptVersion: string | null;
}

/** Adapt the native decision contract to the shared classification response. */
async function classifyEmailWithDecisionAsMeta(
  message: EmailMessage,
  options?: ClassifyOptions,
): Promise<ClassifyEmailWithMetaResult> {
  const provider = createDecisionProvider('gateway');
  const { result, verdict, decision } = await classifyEmailWithDecision(message, provider, options?.context, options?.abortSignal);
  const usage = z.object({ input_tokens: z.number().nonnegative(), output_tokens: z.number().nonnegative() })
    .safeParse(decision.rawMetadata?.['usage']);

  return {
    result,
    verdict,
    abstain: true,
    ensemble: null,
    meta: {
      provider: 'gateway',
      rawText: JSON.stringify(decision.value),
      model: decision.modelVersion,
      usage: { promptTokens: usage.success ? usage.data.input_tokens : null,
        completionTokens: usage.success ? usage.data.output_tokens : null },
      costUsd: typeof decision.rawMetadata?.['costUsd'] === 'number' ? decision.rawMetadata['costUsd'] : null,
      tokensPerSecond: null,
    },
    prompt: JSON.stringify({ state: stateFromMessage(message), questions: buildTicketVerdictQuestions() }),
    promptVersion: TICKET_QUESTIONS_VERSION,
  };
}

/**
 * Like {@link classifyEmail}, but also surfaces provider metadata (raw text,
 * model, token usage) and the resolved prompt — for LLM observability
 * (KAI-110).
 */
export async function classifyEmailWithMeta(
  message: EmailMessage,
  options?: ClassifyOptions,
): Promise<ClassifyEmailWithMetaResult> {
  if (usesDecisionClassification()) {
    return classifyEmailWithDecisionAsMeta(message, options);
  }

  const provider = createCompletionProvider();
  const ensembleTarget = resolveEnsembleTarget();
  const ensembleMisconfigured = Boolean(process.env['INTELLIGENCE_ENSEMBLE']?.trim()) && ensembleTarget === null;
  const lang = options?.lang ?? DEFAULT_LANG;

  const prompt = await buildPrompt(message, lang);
  const promptVersion = await getPromptVersion(lang);
  const { ticketId, accountId } = options?.context ?? {};

  // KAI-126: Langfuse generation trace, grouped per ticket (KAI-189) so a
  // ticket's full tier journey is one story. A no-op when LANGFUSE_* env vars
  // are unset, so this never blocks classification.
  return withGeneration(
    {
      name: 'email-classification',
      model: provider.model,
      input: prompt,
      metadata: generationStartMetadata({
        promptVersion,
        lang,
        ensembleModel: ensembleTarget ? `${ensembleTarget.provider}:${ensembleTarget.model}` : null,
        ensembleMisconfigured,
        ticketId,
        accountId,
      }),
      context: { ...(ticketId ? { ticketId } : {}), ...(accountId ? { accountId } : {}) },
    },
    async (generation) => {
      const completionOptions = {
        abortSignal: options?.abortSignal,
        ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
      };

      let ensembleFailed = false;

      // KAI-45 F3 — the second opinion runs alongside the first, not after it,
      // so the ensemble costs the slower model's latency rather than the sum.
      // Its failure is caught here and only here: the primary's classification
      // stands on its own, and a second model that is down must not take the
      // first one with it.
      const [{ data: verdict, ...meta }, second] = await Promise.all([
        provider.completeJSONWithMeta(prompt, ModelVerdictSchema, completionOptions),
        ensembleTarget
          ? createCompletionProvider(ensembleTarget)
              .completeJSONWithMeta(prompt, ModelVerdictSchema, completionOptions)
              .catch((err: unknown) => {
                ensembleFailed = true;
                console.warn(
                  `[intelligence] ensemble model ${ensembleTarget.provider}:${ensembleTarget.model} failed; ` +
                    `classifying without a second opinion: ${err instanceof Error ? err.message : String(err)}`,
                );
                return null;
              })
          : Promise.resolve(null),
      ]);

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

      // Compare derived ticket types; axis disagreements can compose to the same result.
      const secondType = second
        ? deriveClassification(
            message.facts ?? EXTERNAL_FALLBACK_FACTS,
            {
              actionability: second.data.actionability,
              subjectMatter: second.data.subject_matter,
              priority: second.data.priority,
              tone: second.data.tone,
              urgency: second.data.urgency,
              reasoning: second.data.reasoning,
            },
            second.data.category,
            second.data.confidence,
          ).type
        : null;
      const ensemble = second && secondType ? { model: second.model, type: secondType } : null;
      // A second model that never answered is not a disagreement, and a caller
      // with no headers falls back to `external` by design. Only a real split
      // on the derived type, or evidence the classifier did not get in full,
      // holds the proposal for a person.
      const abstain = (ensemble !== null && ensemble.type !== data.type)
        || Boolean(message.evidence?.truncated) || Boolean(message.evidence?.missing.length);

      generation.update({
        output: meta.rawText,
        ...usageDetails(meta.usage),
        metadata: generationResultMetadata({
          provenance: provenanceOf(message.facts ?? EXTERNAL_FALLBACK_FACTS),
          factsPresent: message.facts !== undefined,
          verdict,
          type: data.type,
          ensemble,
          ensembleFailed,
          abstain,
        }),
      });

      return { result: data, verdict, abstain, ensemble, meta, prompt, promptVersion };
    },
  );
}
