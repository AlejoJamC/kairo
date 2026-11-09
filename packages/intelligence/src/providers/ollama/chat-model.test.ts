import { afterEach, expect, it } from 'bun:test';
import { createOllamaLanguageModel } from './chat-model';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function respond(message: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(init?.body as string) as Record<string, unknown>);
    return Response.json({ model: 'acme-local', message, done_reason: 'stop', prompt_eval_count: 7, eval_count: 3, ...extra });
  }) as typeof fetch;
  return bodies;
}
const tool = { type: 'function' as const, name: 'inspect_ticket', description: 'Read the ticket',
  inputSchema: { type: 'object' as const, properties: {}, additionalProperties: false } };

it('sends tools and maps a tool call back to the SDK', async () => {
  const bodies = respond({ content: '', tool_calls: [{ function: { name: 'inspect_ticket', arguments: { id: 1 } } }] });
  const result = await createOllamaLanguageModel({ model: 'acme-local' }).doGenerate({
    prompt: [{ role: 'system', content: 'Help.' }, { role: 'user', content: [{ type: 'text', text: 'Hi' }] }], tools: [tool] });
  expect(bodies[0]).toMatchObject({ model: 'acme-local', stream: false, tools: [{ type: 'function', function: { name: 'inspect_ticket' } }] });
  expect(result.finishReason.unified).toBe('tool-calls');
  expect(result.content).toMatchObject([{ type: 'tool-call', toolName: 'inspect_ticket', input: '{"id":1}' }]);
  expect(result.usage.inputTokens.total).toBe(7);
});

it('returns tool results to the model and maps a text answer', async () => {
  const bodies = respond({ content: 'Done.' });
  const result = await createOllamaLanguageModel({ model: 'acme-local' }).doGenerate({ prompt: [
    { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'a', toolName: 'inspect_ticket', input: {} }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'a', toolName: 'inspect_ticket', output: { type: 'json', value: { ok: true } } }] },
  ], tools: [tool] });
  expect(bodies[0]!['messages']).toEqual([
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: '', tool_calls: [{ function: { name: 'inspect_ticket', arguments: {} } }] },
    { role: 'tool', tool_name: 'inspect_ticket', content: '{"ok":true}' },
  ]);
  expect(result.content).toEqual([{ type: 'text', text: 'Done.' }]);
  expect(result.finishReason.unified).toBe('stop');
});

it('sends no tools when the SDK forbids them and reports a truncated answer', async () => {
  const bodies = respond({ content: 'Cut' }, { done_reason: 'length' });
  const result = await createOllamaLanguageModel({ model: 'acme-local' }).doGenerate({
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }], tools: [tool], toolChoice: { type: 'none' } });
  expect(bodies[0]).not.toHaveProperty('tools');
  expect(result.finishReason.unified).toBe('length');
});

it('refuses a remote endpoint', () => {
  expect(() => createOllamaLanguageModel({ baseUrl: 'https://models.example.com', model: 'acme-local' })).toThrow(/loopback or private/);
});
