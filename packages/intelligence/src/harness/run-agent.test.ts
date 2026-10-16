import { afterEach, expect, it } from 'bun:test';
import { z } from 'zod';
import { runAgent, type AgentContract, type AgentStepRunner, type OperationResult } from './run-agent';

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
  const requests: Record<string, unknown>[] = [];
  let index = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/config')) return Response.json({ models: [{ id: 'acme/tool-model',
      name: 'Synthetic model', modelType: 'language', specification: { specificationVersion: 'v4', provider: 'gateway', modelId: 'acme/tool-model' } }] });
    const response = responses[index++];
    if (!response) throw new Error('Unexpected model request');
    requests.push(JSON.parse(init?.body as string) as Record<string, unknown>);
    return Response.json({ content: response.content, finishReason: { unified: response.reason, raw: response.reason },
      usage: { inputTokens: { total: 4 }, outputTokens: { total: 2 } }, warnings: [],
      providerMetadata: { gateway: { routing: { canonicalSlug: 'acme/reported-model' }, cost: '0.001' } } });
  }) as typeof fetch;
  return requests;
}
const toolCall = (name: string, id: string) => ({ type: 'tool-call', toolCallId: id, toolName: name, input: '{}' });
const context = { accountId: 'synthetic-account', ticketId: 'synthetic-ticket' };
const read: OperationResult = { status: 'completed', authorization: 'read', data: { subject: 'Access' }, missing: [], needsReview: false };

const contract: AgentContract<{ summary: string }> = {
  feature: 'synthetic_block', promptId: 'ticket-assistant', modelRole: 'assistant',
  tools: ['read_conversation'], maxSteps: 3, maxOutputTokens: 500, readFirst: true,
  output: z.object({ summary: z.string() }),
};

/** A step runner backed by a map, as Inngest memoizes `step.run` results across retries. */
function memoSteps() {
  const memo = new Map<string, unknown>();
  const ids: string[] = [];
  const steps: AgentStepRunner = async <T,>(id: string, run: () => Promise<T>) => {
    ids.push(id);
    if (memo.has(id)) return JSON.parse(JSON.stringify(memo.get(id))) as T;
    const value = await run();
    memo.set(id, JSON.parse(JSON.stringify(value)));
    return value;
  };
  return { steps, ids, memo };
}

it('returns a typed answer after reading through a contract tool', async () => {
  transport([
    { content: [toolCall('read_conversation', 'read-1')], reason: 'tool-calls' },
    { content: [{ type: 'text', text: '{"summary":"Access request"}' }], reason: 'stop' },
  ]);
  let reads = 0;
  const result = await runAgent(contract, { lang: 'en', context, messages: [{ role: 'user', content: 'Summarize the case.' }],
    tools: [{ name: 'read_conversation', description: 'Read the conversation', inputSchema: z.object({}).strict(),
      execute: async () => { reads++; return read; } }] }, { transport: globalThis.fetch });
  expect(reads).toBe(1);
  expect(result.output).toEqual({ summary: 'Access request' });
  expect(result.steps).toBe(2);
  expect(result.operations).toEqual([{ tool: 'read_conversation', result: read }]);
});

it('resumes a run from memoized steps without repeating model calls or tool effects', async () => {
  const { steps, ids } = memoSteps();
  transport([
    { content: [toolCall('read_conversation', 'read-1')], reason: 'tool-calls' },
    { content: [{ type: 'text', text: '{"summary":"Access request"}' }], reason: 'stop' },
  ]);
  let reads = 0;
  const request = { lang: 'en' as const, context, steps, messages: [{ role: 'user' as const, content: 'Summarize the case.' }],
    tools: [{ name: 'read_conversation', description: 'Read the conversation', inputSchema: z.object({}).strict(),
      execute: async () => { reads++; return read; } }] };
  const first = await runAgent(contract, request, { transport: globalThis.fetch });
  expect(ids).toEqual(['synthetic_block:model:0', 'synthetic_block:tool:read_conversation:read-1', 'synthetic_block:model:1']);

  // A retried run: no model response is available and the tool must not run again.
  const replayRequests = transport([]);
  const replay = await runAgent(contract, request, { transport: globalThis.fetch });
  expect(replayRequests).toHaveLength(0);
  expect(reads).toBe(1);
  expect(replay.output).toEqual(first.output);
});

it('refuses a tool outside the block contract before calling the model', async () => {
  const requests = transport([]);
  await expect(runAgent(contract, { lang: 'en', context, messages: [{ role: 'user', content: 'Act.' }],
    tools: [{ name: 'draft_reply', description: 'Draft', inputSchema: z.object({}).strict(), execute: async () => read }] },
  { transport: globalThis.fetch })).rejects.toThrow('outside the synthetic_block contract');
  expect(requests).toHaveLength(0);
});

it('requires a tool on the first step and forbids tools on the last one', async () => {
  const requests = transport([
    { content: [toolCall('read_conversation', 'read-1')], reason: 'tool-calls' },
    { content: [toolCall('read_conversation', 'read-2')], reason: 'tool-calls' },
    { content: [{ type: 'text', text: '{"summary":"Access request"}' }], reason: 'stop' },
  ]);
  await runAgent(contract, { lang: 'en', context, messages: [{ role: 'user', content: 'Summarize the case.' }],
    tools: [{ name: 'read_conversation', description: 'Read the conversation', inputSchema: z.object({}).strict(), execute: async () => read }] },
  { transport: globalThis.fetch });
  expect(requests.map((body) => body['toolChoice'])).toEqual([{ type: 'required' }, { type: 'auto' }, { type: 'none' }]);
});
