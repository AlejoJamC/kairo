import { supabase } from "./supabase.js";

// ---------------------------------------------------------------------------
// KAI-110: LLM observability — fire-and-forget writer for `llm_calls`.
// ---------------------------------------------------------------------------

export type LlmCallOutcome = "accepted" | "edited" | "rejected" | "ignored" | "auto_applied";

export interface LlmCallLogEntry {
  /** snake_case feature identifier — grouping key for analysis (e.g. "email_classification") */
  feature: string;
  provider?: string;
  model: string;
  promptVersion?: string | null;
  promptText: string;
  responseText?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  confidenceScore?: number | null;
  latencyMs?: number | null;
  errorCode?: string | null;
  errorDetail?: string | null;
  triggeredByUserId?: string | null;
  accountId?: string | null;
  ticketId?: string | null;
}

/**
 * Inserts a row into `llm_calls`. Fire-and-forget: never throws, never
 * blocks the caller. Skipped entirely in test environments per
 * OBSERVABILITY.md ("What NOT to store" — no health-check/test calls).
 */
export function logLlmCall(entry: LlmCallLogEntry): void {
  if (process.env["NODE_ENV"] === "test") return;

  supabase
    .from("llm_calls")
    .insert({
      triggered_by_user_id: entry.triggeredByUserId ?? null,
      account_id: entry.accountId ?? null,
      ticket_id: entry.ticketId ?? null,
      feature: entry.feature,
      provider: entry.provider ?? process.env["INTELLIGENCE_PROVIDER"] ?? "ollama",
      model: entry.model,
      prompt_version: entry.promptVersion ?? null,
      prompt_text: entry.promptText,
      response_text: entry.responseText ?? null,
      prompt_tokens: entry.promptTokens ?? null,
      completion_tokens: entry.completionTokens ?? null,
      confidence_score: entry.confidenceScore ?? null,
      latency_ms: entry.latencyMs ?? null,
      error_code: entry.errorCode ?? null,
      error_detail: entry.errorDetail ?? null,
    })
    .then(({ error }) => {
      if (error) console.error("[llm_calls] log failed", error.message);
    });
}
