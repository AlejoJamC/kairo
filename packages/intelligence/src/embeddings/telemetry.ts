import { trace, SpanStatusCode, type Attributes, type Span } from '@opentelemetry/api';
import type { CoverageReport } from './coverage';
import type { SemanticFailure, VectorSpace } from './service';

export type SemanticOperation = 'index' | 'retrieve' | 'read_indexes' | 'group' | 'coverage' | 'submit' | 'index_job';
export type SemanticOutcome = 'ok' | 'partial' | 'unavailable' | 'failed' | 'disabled' | 'skipped' | 'indexed' | 'unchanged' | 'accepted' | 'paused';
export interface SemanticOutcomeSummary {
  outcome: SemanticOutcome;
  reason?: SemanticFailure | 'empty_text' | 'operation_failed' | 'execution_failed' | 'configuration_changed';
  matches?: number;
}
export interface SemanticOperationContext {
  generation: 'none' | 'attempted' | 'reused';
  coverage?: CoverageReport;
  failureReason?: SemanticOutcomeSummary['reason'];
}
export interface SemanticOperationSignal extends SemanticOperationContext, SemanticOutcomeSummary {
  operation: SemanticOperation;
  sources: readonly string[];
  space: VectorSpace | null;
  durationMs: number;
  requestId?: string;
}

const tracer = trace.getTracer('kairo-embeddings');
const prefix = 'kairo.embeddings.';
const technicalId = (value?: string) => value && /^(?:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[0-9A-HJKMNP-TV-Z]{26})$/i.test(value) ? value : undefined;

/** Project an allowlist; never spread requests, sources, matches or errors. */
export function semanticOperationAttributes(signal: SemanticOperationSignal): Attributes {
  return {
    [prefix + 'operation']: signal.operation,
    [prefix + 'source']: signal.sources.join(',') || 'none',
    [prefix + 'space_known']: signal.space !== null,
    ...(signal.space ? { [prefix + 'provider']: signal.space.provider, [prefix + 'model']: signal.space.model,
      [prefix + 'dimensions']: signal.space.dimensions } : {}),
    [prefix + 'duration_ms']: signal.durationMs,
    [prefix + 'outcome']: signal.outcome,
    [prefix + 'generation']: signal.generation,
    ...(signal.reason ? { [prefix + 'reason']: signal.reason } : {}),
    ...(signal.matches !== undefined ? { [prefix + 'matches']: signal.matches } : {}),
    ...(technicalId(signal.requestId) ? { [prefix + 'request_id']: signal.requestId } : {}),
  };
}

function emitCoverage(report: CoverageReport): void {
  const groups = report.sources.length ? report.sources : [{ ...report, source: 'none' }];
  for (const group of groups) {
    const span = tracer.startSpan('embeddings.coverage', { attributes: {
      [prefix + 'source']: group.source,
      [prefix + 'provider']: report.space.provider,
      [prefix + 'model']: report.space.model,
      [prefix + 'dimensions']: report.space.dimensions,
      [prefix + 'coverage.basis']: report.basis,
      [prefix + 'coverage.denominator_known']: group.denominator !== null,
      ...(group.denominator !== null ? { [prefix + 'coverage.denominator']: group.denominator } : {}),
      [prefix + 'coverage.ready']: group.ready,
      [prefix + 'coverage.missing']: group.missing,
      [prefix + 'coverage.stale']: group.stale,
      [prefix + 'coverage.incompatible']: group.incompatible,
      ...(group.unknown !== null ? { [prefix + 'coverage.unknown']: group.unknown } : {}),
    } });
    span.end();
  }
}

export async function observeSemanticOperation<T>(
  info: { operation: SemanticOperation; sources: readonly string[]; space: VectorSpace | null; requestId?: string },
  run: (context: SemanticOperationContext) => Promise<T>,
  summarize: (result: T) => SemanticOutcomeSummary,
  observer?: (signal: SemanticOperationSignal) => void,
): Promise<T> {
  const execute = async (span?: Span) => {
    const started = performance.now();
    const context: SemanticOperationContext = { generation: 'none' };
    let outcome: SemanticOutcomeSummary = { outcome: 'failed', reason: 'operation_failed' };
    let completed = false;
    try {
      const result = await run(context);
      outcome = summarize(result);
      completed = true;
      return result;
    } finally {
      if (!completed && context.failureReason) outcome.reason = context.failureReason;
      const signal: SemanticOperationSignal = { operation: info.operation,
        space: info.space ? { provider: info.space.provider, model: info.space.model, dimensions: info.space.dimensions } : null,
        sources: [...info.sources],
        generation: context.generation, ...(context.coverage ? { coverage: context.coverage } : {}),
        ...(technicalId(info.requestId) ? { requestId: info.requestId } : {}),
        outcome: outcome.outcome, ...(outcome.reason ? { reason: outcome.reason } : {}),
        ...(outcome.matches !== undefined ? { matches: outcome.matches } : {}),
        durationMs: Math.max(0, performance.now() - started) };
      try {
        span?.setAttributes(semanticOperationAttributes(signal));
        if (['failed', 'unavailable', 'partial'].includes(signal.outcome) && signal.reason !== 'disabled') span?.setStatus({ code: SpanStatusCode.ERROR });
        if (span && signal.coverage) emitCoverage(signal.coverage);
      } catch { /* Telemetry cannot change the operation's result. */ }
      try { observer?.(signal); } catch { /* Observers are optional and must not block consumers. */ }
      try { span?.end(); } catch { /* Exporter failures do not fail the operation. */ }
    }
  };
  let execution: Promise<T> | undefined;
  try { return await tracer.startActiveSpan('embeddings.operation', span => (execution = execute(span))); }
  catch { return execution ?? execute(); }
}
