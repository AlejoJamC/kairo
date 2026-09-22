// ---------------------------------------------------------------------------
// KAI-45 F6 — what the classification generation carries into Langfuse.
//
// The generation used to carry `promptVersion` and nothing else, so a trace
// showed a type without the coordinates that produced it: the provenance read
// off the envelope, the two axes the model answered, the table that combined
// them, and — when an ensemble ran — the second opinion. These are the same
// values F5 persists to Postgres, attached to the trace so a generation can be
// read in Langfuse without a database join.
//
// Langfuse flattens metadata into one span attribute per key
// (`langfuse.observation.metadata.<key>`), so the same span reaches ClickStack
// with every field filterable, and a later `update` adds keys rather than
// replacing the object.
//
// No address and no text from the message: provenance is a three-value enum,
// and the reasoning stays in the generation's output where it already was.
// ---------------------------------------------------------------------------

import type { Provenance, TicketType } from '@kairo/types';

import { DERIVATION_VERSION } from './derive';
import type { PromptLang } from './prompt';
import type { ModelVerdictResult } from './schema';

type Metadata = Record<string, string | number | boolean>;

/** Known before the model is called. */
export function generationStartMetadata(input: {
  promptVersion: string | null;
  lang: PromptLang;
  ensembleModel: string | null;
  /** `INTELLIGENCE_ENSEMBLE` is set but unparseable, so no second model runs. */
  ensembleMisconfigured: boolean;
  ticketId?: string | undefined;
  accountId?: string | undefined;
}): Metadata {
  return {
    ...(input.promptVersion ? { promptVersion: input.promptVersion } : {}),
    lang: input.lang,
    derivationVersion: DERIVATION_VERSION,
    ensembleConfigured: input.ensembleModel !== null,
    ...(input.ensembleModel ? { ensembleConfiguredModel: input.ensembleModel } : {}),
    ensembleMisconfigured: input.ensembleMisconfigured,
    ...(input.ticketId ? { ticketId: input.ticketId } : {}),
    ...(input.accountId ? { accountId: input.accountId } : {}),
  };
}

/** Known once the model has answered and the table has derived the type. */
export function generationResultMetadata(input: {
  provenance: Provenance;
  /** False when the caller had no headers and provenance fell back to `external`. */
  factsPresent: boolean;
  verdict: Pick<ModelVerdictResult, 'actionability' | 'subject_matter'>;
  type: TicketType;
  ensemble: { model: string; type: TicketType } | null;
  /** A second model was configured and did not answer. */
  ensembleFailed: boolean;
  abstain: boolean;
}): Metadata {
  return {
    provenance: input.provenance,
    factsPresent: input.factsPresent,
    actionability: input.verdict.actionability,
    subjectMatter: input.verdict.subject_matter,
    type: input.type,
    ...(input.ensemble ? { ensembleModel: input.ensemble.model, ensembleType: input.ensemble.type } : {}),
    ensembleFailed: input.ensembleFailed,
    abstain: input.abstain,
  };
}
