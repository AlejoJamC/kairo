import { describe, it, expect, afterEach } from 'bun:test';
import { z } from 'zod';
import { AnthropicCompletionProvider, supportsTemperature } from './completion';

// ---------------------------------------------------------------------------
// A response carries one block per content type and the text is not always
// first. A reasoning model puts `thinking` at index 0, and if it never stops
// reasoning there is no text block at all — which is how a whole eval run
// aborted on `content[0].text` being undefined.
// ---------------------------------------------------------------------------

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Block {
  type: string;
  text?: string;
  thinking?: string;
}

let lastBody: Record<string, unknown> = {};

function mockResponse(content: Block[], stop_reason = 'end_turn'): void {
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    lastBody = JSON.parse(init.body) as Record<string, unknown>;
    return {
      ok: true,
      json: async () => ({
        content,
        model: 'test-model',
        stop_reason,
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    };
  }) as unknown as typeof fetch;
}

const provider = () => new AnthropicCompletionProvider('test-key', 'claude-sonnet-5');
const schema = z.object({ ok: z.boolean() });

describe('text extraction', () => {
  it('reads the text block when it is first', async () => {
    mockResponse([{ type: 'text', text: 'hello' }]);

    expect(await provider().complete('p')).toBe('hello');
  });

  it('skips a leading thinking block', async () => {
    mockResponse([
      { type: 'thinking', thinking: 'let me consider...' },
      { type: 'text', text: 'hello' },
    ]);

    expect(await provider().complete('p')).toBe('hello');
  });

  it('joins several text blocks', async () => {
    mockResponse([
      { type: 'text', text: 'one ' },
      { type: 'text', text: 'two' },
    ]);

    expect(await provider().complete('p')).toBe('one two');
  });

  it('fails with a diagnosable message when only thinking came back', async () => {
    mockResponse([{ type: 'thinking', thinking: '...' }], 'max_tokens');

    // The old code threw "undefined is not an object", which said nothing
    await expect(provider().complete('p')).rejects.toThrow(/no text block/);
    await expect(provider().complete('p')).rejects.toThrow(/max_tokens/);
  });

  it('fails clearly on empty content', async () => {
    mockResponse([]);

    await expect(provider().complete('p')).rejects.toThrow(/no text block/);
  });

  it('reads the structure from the forced tool call, not from text', async () => {
    mockResponse([
      { type: 'thinking', thinking: '...' },
      { type: 'tool_use', name: 'emit_classification', input: { ok: true } },
    ]);

    expect(await provider().completeJSON('p', schema)).toEqual({ ok: true });
  });

  it('forces the tool so the schema is enforced during generation', async () => {
    mockResponse([{ type: 'tool_use', name: 'emit_classification', input: { ok: true } }]);
    await provider().completeJSON('p', schema);

    expect(lastBody['tool_choice']).toEqual({ type: 'tool', name: 'emit_classification' });
    const tools = lastBody['tools'] as Array<{ name: string; input_schema: unknown }>;
    expect(tools[0]!.name).toBe('emit_classification');
    expect(tools[0]!.input_schema).toMatchObject({ type: 'object', required: ['ok'] });
  });

  it('fails with a diagnosable message when the forced tool call is missing', async () => {
    mockResponse([{ type: 'text', text: 'sorry, I cannot' }], 'end_turn');

    await expect(provider().completeJSON('p', schema)).rejects.toThrow(/emit_classification/);
  });

  it('plain completion carries no tools', async () => {
    mockResponse([{ type: 'text', text: 'x' }]);
    await provider().complete('p');

    expect('tools' in lastBody).toBe(false);
  });
});

describe('request shape', () => {
  it('disables thinking — classification is a rubric lookup, not reasoning', async () => {
    mockResponse([{ type: 'text', text: 'x' }]);
    await provider().complete('p');

    expect(lastBody['thinking']).toEqual({ type: 'disabled' });
  });

  it('omits temperature on the Claude 5 line, which rejects it', async () => {
    mockResponse([{ type: 'text', text: 'x' }]);
    await new AnthropicCompletionProvider('k', 'claude-sonnet-5').complete('p', { temperature: 0 });

    expect('temperature' in lastBody).toBe(false);
  });

  it('still sends temperature on earlier models', async () => {
    mockResponse([{ type: 'text', text: 'x' }]);
    await new AnthropicCompletionProvider('k', 'claude-sonnet-4-6').complete('p', { temperature: 0 });

    expect(lastBody['temperature']).toBe(0);
  });
});

describe('supportsTemperature', () => {
  it('knows which families removed the parameter', () => {
    for (const m of ['claude-sonnet-5', 'claude-opus-5', 'claude-fable-5', 'claude-sonnet-5-20260305']) {
      expect(supportsTemperature(m)).toBe(false);
    }
    for (const m of ['claude-sonnet-4-6', 'claude-haiku-4-5-20251001']) {
      expect(supportsTemperature(m)).toBe(true);
    }
  });
});
