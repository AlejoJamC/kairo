import { startObservation, propagateAttributes, type LangfuseGeneration } from '@langfuse/tracing';
import type { CompletionUsage } from '../providers/base';

/** Business identifiers to correlate a generation back to a ticket/tenant in Langfuse. */
export interface LangfuseContext {
  ticketId?: string;
  accountId?: string;
}

export interface GenerationSpec {
  /** Observation name in Langfuse, e.g. `email-classification`. */
  name: string;
  model: string;
  input: unknown;
  metadata?: Record<string, unknown>;
  context?: LangfuseContext;
}

/**
 * Runs `fn` inside one Langfuse generation, grouped under the ticket's session.
 *
 * The single implementation of the pattern every model call needs: open the
 * generation, group it by `sessionId = ticketId` (with `accountId` in trace
 * metadata) so a ticket's calls read as one story, mark it `ERROR` and rethrow
 * on failure, and always end it. A no-op tracer when `LANGFUSE_*` is unset, so
 * it never blocks the call it wraps.
 */
export async function withGeneration<T>(
  spec: GenerationSpec,
  fn: (generation: LangfuseGeneration) => Promise<T>,
): Promise<T> {
  const { ticketId, accountId } = spec.context ?? {};

  const run = async (): Promise<T> => {
    const generation = startObservation(
      spec.name,
      {
        model: spec.model,
        input: spec.input,
        ...(spec.metadata ? { metadata: spec.metadata } : {}),
      },
      { asType: 'generation' },
    );
    try {
      return await fn(generation);
    } catch (err) {
      generation.update({ level: 'ERROR', statusMessage: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      generation.end();
    }
  };

  if (ticketId || accountId) {
    return propagateAttributes(
      { ...(ticketId ? { sessionId: ticketId } : {}), ...(accountId ? { metadata: { accountId } } : {}) },
      run,
    );
  }
  return run();
}

/** Provider usage in Langfuse's `usageDetails` shape; absent counts are omitted. */
export function usageDetails(usage: CompletionUsage): { usageDetails?: Record<string, number> } {
  const details: Record<string, number> = {};
  if (usage.promptTokens != null) details.input = usage.promptTokens;
  if (usage.completionTokens != null) details.output = usage.completionTokens;
  return Object.keys(details).length > 0 ? { usageDetails: details } : {};
}
