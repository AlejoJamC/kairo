import { afterAll, beforeEach, expect, mock, test } from 'bun:test';
import { trace, type Attributes, type Span, type Tracer } from '@opentelemetry/api';

const spans: Array<{ name: string; attributes: Attributes; ended: boolean }> = [];
let failStart = false;
let failAttributes = false;
function startSpan(name: string, options?: { attributes?: Attributes }): Span {
  const entry = { name, attributes: { ...options?.attributes }, ended: false };
  spans.push(entry);
  return { setAttributes: (attributes: Attributes) => {
    if (failAttributes) throw new Error('Invented exporter failure');
    Object.assign(entry.attributes, attributes);
  },
    setStatus: () => {}, end: () => { entry.ended = true; } } as unknown as Span;
}
const tracer = { startSpan, startActiveSpan: (name: string, fn: (span: Span) => unknown) => {
  if (failStart) throw new Error('Invented tracer failure');
  return fn(startSpan(name));
} } as unknown as Tracer;
trace.setGlobalTracerProvider({ getTracer: () => tracer });

const generations: Array<{ name: string; options: Record<string, unknown>; updates: unknown[]; ended: boolean }> = [];
const embed = mock(async (_text: string) => [1,0]);
const realProviders = { ...await import('../config/providers') };
const realTracing = { ...await import('@langfuse/tracing') };
mock.module('../config/providers', () => ({ ...realProviders, createEmbeddingProvider: () => ({ model: 'acme', embed,
  embedBatch: async (texts: string[]) => Promise.all(texts.map(embed)) }) }));
mock.module('@langfuse/tracing', () => ({ ...realTracing,
  startObservation: (name: string, options: Record<string, unknown>) => {
    const entry = { name, options, updates: [] as unknown[], ended: false };
    generations.push(entry);
    return { update: (value: unknown) => entry.updates.push(value), end: () => { entry.ended = true; } };
  },
}));
const { createSemanticService } = await import('./service');
const { generateEmbedding, generateEmbeddings } = await import('./embed');
const { observeSemanticOperation } = await import('./telemetry');
afterAll(() => { trace.disable(); mock.module('../config/providers', () => realProviders); mock.module('@langfuse/tracing', () => realTracing); });
beforeEach(() => { spans.length = 0; generations.length = 0; failStart = false; failAttributes = false; embed.mockReset(); embed.mockResolvedValue([1,0]); });
const space = { provider: 'synthetic', model: 'acme', dimensions: 2 };

test('public operations emit safe OpenTelemetry attributes and coverage snapshots without another generation', async () => {
  const source = { reference: { kind: 'ticket', id: 'Acme-private-source' }, accountId: 'Acme-private-account',
    revision: 'Acme-private-revision', preparation: 'v1', text: 'Acme-private-text' };
  const service = createSemanticService({ scope: { accountId: source.accountId, actor: { kind: 'user', id: 'Acme-private-actor' }, permissions: ['retrieve','index'] },
    space, embed, adapters: [{ kind: 'ticket', purposes: ['similar_cases'], load: async () => source, store: async () => 'indexed',
      search: async () => ({ source: 'ticket', status: 'ok', matches: [] }) }] });
  await service.indexSource({ source: source.reference });
  await service.inspectCoverage({ sources: [source.reference] });
  const operations = spans.filter(span => span.name === 'embeddings.operation');
  expect(operations.map(span => span.attributes['kairo.embeddings.operation'])).toEqual(['index','coverage']);
  expect(spans.filter(span => span.name === 'embeddings.coverage')).toHaveLength(2);
  expect(spans.every(span => span.ended)).toBe(true);
  expect(JSON.stringify(spans)).not.toContain('Acme-private');
  expect(generations).toHaveLength(0);
});

test('single and batch embedding calls keep one generation each without content, business identifiers or provider errors', async () => {
  await generateEmbedding('Acme-private-text', { accountId: 'Acme-private-account', ticketId: 'Acme-private-ticket' });
  await generateEmbeddings(['Acme-private-text'], { accountId: 'Acme-private-account' });
  embed.mockRejectedValueOnce(new Error('Acme-private-provider-secret'));
  await expect(generateEmbedding('Acme-private-text')).rejects.toThrow('Acme-private-provider-secret');
  expect(generations.map(generation => generation.name)).toEqual(['embedding','embedding-batch','embedding']);
  expect(generations.every(generation => generation.ended)).toBe(true);
  expect(generations[2]!.updates).toContainEqual({ level: 'ERROR', statusMessage: 'Embedding generation failed' });
  expect(JSON.stringify(generations)).not.toContain('Acme-private');
});

test('unexpected failures are recorded without their payload and request correlation only uses controlled technical IDs', async () => {
  await expect(observeSemanticOperation({ operation: 'index_job', sources: ['ticket'], space,
    requestId: '11111111-1111-4111-8111-111111111111' }, async () => { throw new Error('Acme-private-provider-secret'); },
  () => ({ outcome: 'ok' }))).rejects.toThrow('Acme-private-provider-secret');
  expect(spans[0]!.attributes).toMatchObject({ 'kairo.embeddings.outcome': 'failed', 'kairo.embeddings.reason': 'operation_failed',
    'kairo.embeddings.request_id': '11111111-1111-4111-8111-111111111111' });
  await observeSemanticOperation({ operation: 'submit', sources: [], space: null, requestId: 'Acme-private-identifier' },
    async () => undefined, () => ({ outcome: 'disabled', reason: 'disabled' }));
  expect(spans[1]!.attributes).not.toHaveProperty('kairo.embeddings.request_id');
  expect(spans[1]!.attributes).toMatchObject({ 'kairo.embeddings.space_known': false, 'kairo.embeddings.outcome': 'disabled' });
  expect(JSON.stringify(spans)).not.toContain('Acme-private');
});

test('tracer or exporter failures cannot fail or duplicate a domain operation', async () => {
  for (const failure of ['start','attributes']) {
    failStart = failure === 'start'; failAttributes = failure === 'attributes';
    const run = mock(async () => 'completed');
    expect(await observeSemanticOperation({ operation: 'index', sources: ['ticket'], space }, run, () => ({ outcome: 'indexed' }))).toBe('completed');
    expect(run).toHaveBeenCalledTimes(1);
  }
});

test('unexpected configuration and summary fields never enter an emitted signal', async () => {
  const extendedSpace = { ...space, secret: 'Acme-private-secret' };
  const summary = { outcome: 'ok' as const, providerBody: 'Acme-private-body' };
  const signals: unknown[] = [];
  await observeSemanticOperation({ operation: 'retrieve', sources: ['ticket'], space: extendedSpace },
    async () => undefined, () => summary, signal => signals.push(signal));
  expect(JSON.stringify(signals)).not.toContain('Acme-private');
  expect(JSON.stringify(spans)).not.toContain('Acme-private');
});
