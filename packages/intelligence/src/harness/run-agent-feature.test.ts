import { afterEach, expect, it } from 'bun:test';
import { z } from 'zod';
import { runAgentFeature, type OperationResult } from './run-agent-feature';

const originalFetch = globalThis.fetch;
const originalModel = process.env['AI_GATEWAY_ASSISTANT_MODEL'];
const originalKey = process.env['AI_GATEWAY_API_KEY'];
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalModel === undefined) delete process.env['AI_GATEWAY_ASSISTANT_MODEL'];
  else process.env['AI_GATEWAY_ASSISTANT_MODEL'] = originalModel;
  if (originalKey === undefined) delete process.env['AI_GATEWAY_API_KEY'];
  else process.env['AI_GATEWAY_API_KEY'] = originalKey;
});

function transport(responses: { content: unknown[]; reason: string }[]) {
  process.env['AI_GATEWAY_ASSISTANT_MODEL'] = 'acme/tool-model';
  process.env['AI_GATEWAY_API_KEY'] = 'synthetic-key';
  let index = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/config')) return Response.json({ models: [{ id: 'acme/tool-model',
      name: 'Synthetic model', modelType: 'language', specification: { specificationVersion: 'v4', provider: 'gateway', modelId: 'acme/tool-model' } }] });
    const response = responses[index++];
    expect(JSON.parse(init?.body as string).providerOptions.gateway.only).toEqual(['acme']);
    if (!response) throw new Error('Unexpected model request');
    return Response.json({ content: response.content, finishReason: { unified: response.reason, raw: response.reason },
      usage: { inputTokens: { total: 4 }, outputTokens: { total: 2 } }, warnings: [],
      providerMetadata: { gateway: { routing: { canonicalSlug: 'acme/reported-model' }, cost: '0.001' } } });
  }) as typeof fetch;
}
const toolCall = (name: string, id: string) => ({ type: 'tool-call', toolCallId: id, toolName: name, input: '{}' });
const context = { accountId: 'synthetic-account', ticketId: 'synthetic-ticket', userId: 'synthetic-user' };

it('executes real tools once, retains proposal status and returns a final answer despite logging failure', async () => {
  transport([
    { content: [toolCall('inspect_ticket', 'read')], reason: 'tool-calls' },
    { content: [toolCall('draft_reply', 'draft-a'), toolCall('draft_reply', 'draft-b')], reason: 'tool-calls' },
    { content: [{ type: 'text', text: 'A draft is ready for review.' }], reason: 'stop' },
  ]);
  let drafts = 0;
  const proposal: OperationResult = { status: 'proposed', authorization: 'human_review', data: { proposalId: 'synthetic-proposal' }, missing: [], needsReview: true };
  const result = await runAgentFeature({ lang: 'en', context, messages: [{ role: 'user', content: 'Draft a reply.' }],
    logger: async () => { throw new Error('Synthetic logging failure'); }, tools: [
      { name: 'inspect_ticket', description: 'Read context', inputSchema: z.object({}).strict(),
        execute: async () => ({ status: 'completed', authorization: 'read', data: {}, missing: [], needsReview: false }) },
      { name: 'draft_reply', description: 'Store a pending draft', inputSchema: z.object({}).strict(),
        execute: async () => { drafts++; return proposal; } },
    ] }, { transport: globalThis.fetch });
  expect(drafts).toBe(1);
  expect(result.operations.filter((operation) => operation.tool === 'draft_reply').every((operation) => operation.result.status === 'proposed')).toBe(true);
  expect(result.text).toBe('A draft is ready for review.');
  expect(result.model).toBe('acme/reported-model');
  expect(result.costUsd).toBeCloseTo(0.003);
});

it('returns failed tool evidence when a domain service fails instead of claiming completion', async () => {
  transport([
    { content: [toolCall('inspect_ticket', 'read')], reason: 'tool-calls' },
    { content: [{ type: 'text', text: 'Ticket context is unavailable.' }], reason: 'stop' },
  ]);
  const result = await runAgentFeature({ lang: 'en', context, messages: [{ role: 'user', content: 'Read this ticket.' }],
    tools: [{ name: 'inspect_ticket', description: 'Read context', inputSchema: z.object({}).strict(),
      execute: async () => { throw new Error('Synthetic persistence failure'); } }] }, { transport: globalThis.fetch });
  expect(result.operations[0]?.result).toMatchObject({ status: 'failed', authorization: 'denied', missing: ['tool_unavailable'], needsReview: true });
});

it('rejects an empty final model answer instead of reporting a successful conversation', async () => {
  transport([
    { content: [toolCall('inspect_ticket', 'read')], reason: 'tool-calls' },
    { content: [], reason: 'stop' },
  ]);
  await expect(runAgentFeature({ lang: 'en', context, messages: [{ role: 'user', content: 'Read this ticket.' }],
    tools: [{ name: 'inspect_ticket', description: 'Read context', inputSchema: z.object({}).strict(),
      execute: async () => ({ status: 'completed', authorization: 'read', data: {}, missing: [], needsReview: false }) }] }, { transport: globalThis.fetch }))
    .rejects.toThrow(/no final answer/);
});

it('blocks the production tool loop before model requests or tool effects when BYOK-only cannot be enforced', async () => {
  transport([]);
  let executions = 0;
  await expect(runAgentFeature({ lang: 'en', context, messages: [{ role: 'user', content: 'Read this ticket.' }],
    tools: [{ name: 'inspect_ticket', description: 'Read context', inputSchema: z.object({}).strict(),
      execute: async () => {
        executions++;
        return { status: 'completed', authorization: 'read', data: {}, missing: [], needsReview: false };
      } }] })).rejects.toThrow(/BYOK-only/);
  expect(executions).toBe(0);
});
