import { startObservation, propagateAttributes } from '@langfuse/tracing';
import { createCompletionProvider } from '../config/providers';
import { resolveEnsembleTarget } from '../config/ensemble';
import { ModelVerdictSchema, type ClassificationResult, type ModelVerdictResult } from './schema';
import { deriveClassification, provenanceOf } from './derive';
import { buildPrompt, getPromptVersion, type PromptLang, DEFAULT_LANG } from './prompt';
import { generationResultMetadata, generationStartMetadata } from './telemetry';
import type { EmailMessage } from './types';
import type { TicketType } from '@kairo/types';
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
): Promise<{
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
}> {
  const provider = createCompletionProvider();
  const ensembleTarget = resolveEnsembleTarget();
  const ensembleMisconfigured = Boolean(process.env['INTELLIGENCE_ENSEMBLE']?.trim()) && ensembleTarget === null;
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
        metadata: generationStartMetadata({
          promptVersion,
          lang,
          ensembleModel: ensembleTarget ? `${ensembleTarget.provider}:${ensembleTarget.model}` : null,
          ensembleMisconfigured,
          ticketId,
          accountId,
        }),
      },
      { asType: 'generation' },
    );

    const completionOptions = {
      ...(options?.temperature !== undefined ? { temperature: options.temperature } : {}),
    };

    let ensembleFailed = false;

    try {
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

      // Disagreement is judged on the derived type, not the raw axes. Two axis
      // pairs that land on the same `ticket_type` are not a disagreement anyone
      // downstream could see, and sending them to a human would spend attention
      // on a difference that changes nothing. It is also the signal E3 measured:
      // agreement on the label, 78% right when it holds and 38% when it splits.
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
      const abstain = ensemble !== null && ensemble.type !== data.type;

      const usageDetails: Record<string, number> = {};
      if (meta.usage.promptTokens != null) usageDetails.input = meta.usage.promptTokens;
      if (meta.usage.completionTokens != null) usageDetails.output = meta.usage.completionTokens;

      generation.update({
        output: meta.rawText,
        ...(Object.keys(usageDetails).length > 0 ? { usageDetails } : {}),
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
