import { randomUUID } from 'node:crypto';
import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { fetchOrThrow, ProviderError } from '../base';
import { localOllamaEndpoint } from './local-endpoint';

/** The AI SDK language-model contract, derived from the SDK so no provider package is needed. */
type LanguageModelV4 = Extract<LanguageModel, { specificationVersion: 'v4' }>;
type CallOptions = Parameters<LanguageModelV4['doGenerate']>[0];
type GenerateResult = Awaited<ReturnType<LanguageModelV4['doGenerate']>>;

const ChatResponseSchema = z.object({
  model: z.string().optional(),
  message: z.object({
    content: z.string().default(''),
    tool_calls: z.array(z.object({
      function: z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()).default({}) }),
    })).optional(),
  }),
  done_reason: z.string().optional(),
  prompt_eval_count: z.number().optional(),
  eval_count: z.number().optional(),
});

type OllamaMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: { function: { name: string; arguments: unknown } }[] }
  | { role: 'tool'; tool_name: string; content: string };

function toolOutputText(output: { type: string; value?: unknown; reason?: string }): string {
  if (output.type === 'text' || output.type === 'error-text') return String(output.value ?? '');
  if (output.type === 'execution-denied') return output.reason ?? 'Tool execution was denied';
  return JSON.stringify(output.value ?? null);
}

/** Maps the SDK prompt to Ollama chat messages; files and reasoning parts are not sent. */
function toMessages(prompt: CallOptions['prompt']): OllamaMessage[] {
  const messages: OllamaMessage[] = [];
  for (const message of prompt) {
    if (message.role === 'system') {
      messages.push({ role: 'system', content: message.content });
    } else if (message.role === 'user') {
      messages.push({ role: 'user', content: message.content.flatMap((part) => part.type === 'text' ? [part.text] : []).join('\n') });
    } else if (message.role === 'assistant') {
      const calls = message.content.flatMap((part) => part.type === 'tool-call'
        ? [{ function: { name: part.toolName, arguments: typeof part.input === 'string' ? JSON.parse(part.input) as unknown : part.input } }] : []);
      messages.push({ role: 'assistant', content: message.content.flatMap((part) => part.type === 'text' ? [part.text] : []).join(''),
        ...(calls.length ? { tool_calls: calls } : {}) });
    } else {
      for (const part of message.content) {
        if (part.type === 'tool-result') messages.push({ role: 'tool', tool_name: part.toolName, content: toolOutputText(part.output) });
      }
    }
  }
  return messages;
}

/**
 * A local Ollama model as an AI SDK language model with tool calling, so an
 * agent loop can run without Gateway. Ollama has no tool-choice control, so a
 * required tool call can only be asked for in the instructions. Non-streaming only.
 */
export function createOllamaLanguageModel(options: { baseUrl?: string; model: string }): LanguageModelV4 {
  const baseUrl = localOllamaEndpoint(options.baseUrl ?? 'http://localhost:11434');
  const request = async (call: CallOptions) => {
    const tools = call.toolChoice?.type === 'none' ? [] : (call.tools ?? []).flatMap((tool) => tool.type === 'function' ? [tool] : []);
    const signal = call.abortSignal ? AbortSignal.any([call.abortSignal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000);
    const body = {
      model: options.model, stream: false, messages: toMessages(call.prompt),
      ...(tools.length ? { tools: tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description ?? '', parameters: tool.inputSchema } })) } : {}),
      options: {
        ...(call.temperature !== undefined ? { temperature: call.temperature } : {}),
        ...(call.maxOutputTokens !== undefined ? { num_predict: call.maxOutputTokens } : {}),
      },
    };
    const response = await fetchOrThrow(`${baseUrl}/api/chat`, { method: 'POST', redirect: 'error', signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, 'Ollama');
    if (!response.ok) throw new ProviderError(`Ollama request failed (HTTP ${response.status})`, response.status >= 500 || response.status === 429);
    const parsed = ChatResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new ProviderError('Ollama returned an unexpected response', false);
    return { data: parsed.data, body };
  };

  return {
    specificationVersion: 'v4',
    provider: 'ollama',
    modelId: options.model,
    supportedUrls: {},
    async doGenerate(call): Promise<GenerateResult> {
      const { data, body } = await request(call);
      const toolCalls = data.message.tool_calls ?? [];
      const unified = toolCalls.length ? 'tool-calls' as const : data.done_reason === 'length' ? 'length' as const : 'stop' as const;
      return {
        content: [
          ...(data.message.content ? [{ type: 'text' as const, text: data.message.content }] : []),
          ...toolCalls.map((tool) => ({ type: 'tool-call' as const, toolCallId: `ollama-${randomUUID()}`,
            toolName: tool.function.name, input: JSON.stringify(tool.function.arguments) })),
        ],
        finishReason: { unified, raw: data.done_reason },
        usage: {
          inputTokens: { total: data.prompt_eval_count, noCache: data.prompt_eval_count, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: data.eval_count, text: data.eval_count, reasoning: undefined },
        },
        request: { body },
        response: { modelId: data.model ?? options.model, timestamp: new Date() },
        warnings: [],
      };
    },
    async doStream() {
      throw new ProviderError('Ollama streaming is not supported by this adapter', false);
    },
  };
}
