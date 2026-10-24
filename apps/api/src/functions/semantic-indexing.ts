import { NonRetriableError } from 'inngest';
import { resolveModelRoute, configuredEmbeddingDimensions, sameVectorSpace, SEMANTIC_SOURCE_DEFINITIONS, observeSemanticOperation } from '@kairo/intelligence';
import { inngest } from '../lib/inngest';
import { supabase } from '../lib/supabase';
import { SemanticIndexJob } from '../lib/semantic-indexing';
import { createBackendSemanticService } from '../lib/semantic-service';

export const semanticIndexing = inngest.createFunction({
  id: 'semantic-indexing', retries: 5, concurrency: { limit: 5 },
  triggers: [{ event: 'embeddings/index.requested' }],
  onFailure: async ({ event, step }) => {
    const job = SemanticIndexJob.safeParse(event.data.event.data);
    if (!job.success) return;
    await observeSemanticOperation({ operation: 'index_job', space: job.data.space, sources: [job.data.source.kind],
      requestId: event.data.event.id }, async () => step.sendEvent('terminal-failure', { name: 'embeddings/index.result', data: {
      accountId: job.data.accountId, source: job.data.source, requestId: event.data.event.id,
      status: 'failed', reason: 'execution_failed',
    } }), () => ({ outcome: 'failed', reason: 'execution_failed' }));
  },
}, async ({ event, step }) => {
  const job = SemanticIndexJob.parse(event.data);
  for (let pause = 0; ; pause++) {
    const result = await step.run(`index-${pause}`, () => observeSemanticOperation({ operation: 'index_job',
      sources: [job.source.kind], space: job.space, requestId: event.id }, async context => {
      const route = resolveModelRoute('embedding');
      if (!sameVectorSpace(job.space, { provider: route.provider, model: route.model, dimensions: configuredEmbeddingDimensions() }) ||
        job.preparation !== SEMANTIC_SOURCE_DEFINITIONS[job.source.kind].preparation) {
        context.failureReason = 'configuration_changed';
        throw new NonRetriableError('Semantic indexing configuration changed; submit the source again');
      }
      const service = createBackendSemanticService({ db: supabase,
        scope: { accountId: job.accountId, actor: { kind: 'workflow', id: event.id! }, permissions: ['index'] } });
      const result = await service.indexSource({ source: job.source, expectedRevision: job.revision });
      if (result.status === 'failed' && ['provider_unavailable', 'storage_unavailable'].includes(result.reason)) {
        context.failureReason = result.reason;
        throw new Error('Semantic indexing temporarily unavailable');
      }
      if (result.status === 'failed' && !['disabled', 'revision_changed', 'not_found'].includes(result.reason)) {
        context.failureReason = result.reason;
        throw new NonRetriableError(`Semantic indexing failed: ${result.reason}`);
      }
      return result;
    }, result => ({ outcome: result.status === 'failed' && result.reason === 'disabled' ? 'paused' : result.status,
      ...('reason' in result ? { reason: result.reason } : {}) })));
    if (result.status !== 'failed' || result.reason !== 'disabled') {
      await step.sendEvent('result', { name: 'embeddings/index.result', data: {
        accountId: job.accountId, source: job.source, requestId: event.id, ...result,
      } });
      return { source: job.source, ...result };
    }
    await step.sendEvent(`paused-${pause}`, { name: 'embeddings/index.progress', data: {
      accountId: job.accountId, source: job.source, requestId: event.id, status: 'paused', reason: 'disabled',
    } });
    const resumed = await step.waitForEvent(`resume-${pause}`, { event: 'embeddings/resumed', timeout: '7d',
      if: 'async.data.accountId == event.data.accountId' });
    if (!resumed) continue;
  }
});
