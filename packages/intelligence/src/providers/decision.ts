// ---------------------------------------------------------------------------
// KAI-61 — the second shape of provider Kairo executes against.
//
// CompletionProvider (base.ts) is a prompt completed into text. This is a
// typed question evaluated against a piece of state, answered with a typed
// value and its own confidence — no prompt, no messages, no text to parse.
// JEV (providers/jev/decision.ts) is the first implementation; nothing here
// knows what a ticket is or what its questions mean — that stays with the
// caller, per KAI-55.
// ---------------------------------------------------------------------------

export interface DecisionProvider {
  readonly model: string;
  decide<TDecision>(input: TypedDecisionInput): Promise<DecisionResult<TDecision>>;
}

export interface TypedDecisionInput {
  /**
   * Whatever context the caller assembled for this decision — a ticket, an
   * email, anything. This contract does not interpret it; only the caller and
   * the concrete provider give it meaning.
   */
  state: unknown;
  /**
   * The typed questions to evaluate against `state`. Shape is
   * provider-specific — a JEV adapter expects its own Choice/Score/Noul
   * question objects, not a generic schema this contract could define.
   */
  questions: unknown;
}

export interface DecisionResult<TDecision> {
  value: TDecision;
  /**
   * Null when the call asked more than one question — there is no single
   * confidence for the call, and each answer inside `value`/`rawMetadata`
   * carries its own.
   */
  confidence: number | null;
  provider: string;
  modelVersion: string;
  latencyMs: number;
  rawMetadata?: Record<string, unknown>;
}
