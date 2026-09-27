import {
  classifyEmailWithJev,
  createDecisionProvider,
  type DecisionProvider,
  type EmailMessage,
} from "@kairo/intelligence";
import { logLlmCall, type LlmCallLogEntry } from "./llm-logging.js";
import { pipelineLog } from "./pipeline-logger.js";

// ---------------------------------------------------------------------------
// KAI-55 Fase 3 — modo shadow. JEV runs alongside the real classification for
// a brand-new ticket, never applies its decision, and never affects the
// ticket the real classifier already wrote. The outcome is logged to
// `llm_calls` exactly like every other model call (KAI-110), so it can be
// compared against the real classification and the eventual human outcome
// with the same tooling, not a new storage path.
//
// Fire-and-forget: callers never await runJevShadowClassification. Every
// failure — including a missing TYPESAFE_API_KEY — is caught here, so shadow
// traffic can never slow down or break the real pipeline. Callers gate this
// behind `enable_jev_shadow_classification` themselves, the same way
// tier1-fast-path gates `enable_contact_extraction`.
// ---------------------------------------------------------------------------

export interface JevShadowContext {
  accountId: string;
  ticketId: string;
}

interface JevShadowDeps {
  createProvider: () => DecisionProvider;
  classify: typeof classifyEmailWithJev;
  log: (entry: LlmCallLogEntry) => void;
}

const FEATURE = "email_classification_jev_shadow";

const defaultDeps: JevShadowDeps = {
  createProvider: createDecisionProvider,
  classify: classifyEmailWithJev,
  log: logLlmCall,
};

/** The awaitable unit: exported for tests, which inject fakes for all three deps. */
export async function classifyJevShadow(
  message: EmailMessage,
  context: JevShadowContext,
  deps: JevShadowDeps = defaultDeps,
): Promise<void> {
  const start = Date.now();
  try {
    const provider = deps.createProvider();
    const { decision, verdict } = await deps.classify(message, provider, context);
    deps.log({
      feature: FEATURE,
      provider: decision.provider,
      model: decision.modelVersion,
      promptText: JSON.stringify({ state: message }),
      responseText: JSON.stringify(decision.value),
      confidenceScore: verdict.confidence,
      latencyMs: decision.latencyMs,
      accountId: context.accountId,
      ticketId: context.ticketId,
    });
  } catch (err) {
    pipelineLog(
      "jev-shadow",
      `ticket_id=${context.ticketId} FAILED: ${err instanceof Error ? err.message : String(err)}`,
    );
    deps.log({
      feature: FEATURE,
      provider: "jev",
      model: "jev",
      promptText: JSON.stringify({ state: message }),
      latencyMs: Date.now() - start,
      errorCode: "JEV_SHADOW_ERROR",
      errorDetail: err instanceof Error ? err.message : String(err),
      accountId: context.accountId,
      ticketId: context.ticketId,
    });
  }
}

/** The pipeline entrypoint: fire-and-forget, never awaited or allowed to throw. */
export function runJevShadowClassification(message: EmailMessage, context: JevShadowContext): void {
  void classifyJevShadow(message, context);
}
