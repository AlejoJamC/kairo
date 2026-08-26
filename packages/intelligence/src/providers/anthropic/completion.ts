import { z } from 'zod';
import type { CompletionProvider, CompletionOptions, CompletionMeta } from '../base';

interface AnthropicContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
}

// Forcing a tool call is how the API is told to produce a structure rather
// than asked to. The schema is validated server-side during generation, so an
// enum violation or a missing field cannot come back at all.
const CLASSIFY_TOOL = 'emit_classification';

interface AnthropicMessage {
  content: AnthropicContentBlock[];
  model?: string;
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';

// The Claude 5 line (Fable/Mythos/Opus/Sonnet 5) removed sampling params —
// `temperature` (and top_p/top_k) return a 400 if sent at all, rather than
// being silently ignored. Matches dated snapshots too (e.g. `-5-20260305`).
const NO_TEMPERATURE_MODEL = /^claude-(fable|mythos|opus|sonnet)-5(-|$)/;

export function supportsTemperature(model: string): boolean {
  return !NO_TEMPERATURE_MODEL.test(model);
}

// Classification is a lookup against a rubric, not a reasoning problem. The
// Claude 5 line reasons by default and its thinking tokens count against
// max_tokens, so it would spend the whole budget thinking and return a
// response with no text block at all — raising max_tokens does not help, it
// just thinks longer. Every model in use accepts the parameter, so it is sent
// unconditionally rather than gated on a model list that would go stale.
const THINKING_DISABLED = { type: 'disabled' } as const;

/**
 * A response carries one block per content type. Never assume index 0 is the
 * text: a reasoning model puts `thinking` first, and if it never finishes
 * there is no text block at all.
 */
function extractText(data: AnthropicMessage, model: string): string {
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');

  if (text === '') {
    const types = (data.content ?? []).map((b) => b.type).join(', ') || 'none';
    throw new Error(
      `Anthropic response carried no text block (model ${model}, ` +
        `blocks: ${types}, stop_reason: ${data.stop_reason ?? 'unknown'}). ` +
        'If the model was still reasoning, it ran out of max_tokens before answering.',
    );
  }
  return text;
}

export class AnthropicCompletionProvider implements CompletionProvider {
  public readonly model: string;
  private apiKey: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model ?? DEFAULT_MODEL;
  }

  async complete(prompt: string, options: CompletionOptions = {}): Promise<string> {
    const { text } = await this.completeWithMeta(prompt, options);
    return text;
  }

  async completeWithMeta(prompt: string, options: CompletionOptions = {}): Promise<{ text: string } & CompletionMeta> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxTokens ?? 1000,
        ...(supportsTemperature(this.model) ? { temperature: options.temperature ?? 0.7 } : {}),
        thinking: THINKING_DISABLED,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.statusText} - ${error}`);
    }

    const data = await response.json() as AnthropicMessage;
    const text = extractText(data, this.model);
    return {
      text,
      rawText: text,
      model: data.model ?? this.model,
      usage: {
        promptTokens: data.usage?.input_tokens ?? null,
        completionTokens: data.usage?.output_tokens ?? null,
      },
    };
  }

  async completeJSON<T>(prompt: string, schema: z.ZodSchema<T>, options: CompletionOptions = {}): Promise<T> {
    const { data } = await this.completeJSONWithMeta(prompt, schema, options);
    return data;
  }

  async completeJSONWithMeta<T>(
    prompt: string,
    schema: z.ZodSchema<T>,
    options: CompletionOptions = {},
  ): Promise<{ data: T } & CompletionMeta> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxTokens ?? 1000,
        ...(supportsTemperature(this.model) ? { temperature: options.temperature ?? 0.3 } : {}),
        thinking: THINKING_DISABLED,
        tools: [{
          name: CLASSIFY_TOOL,
          description: 'Return the classification of the email.',
          input_schema: z.toJSONSchema(schema),
        }],
        tool_choice: { type: 'tool', name: CLASSIFY_TOOL },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.statusText} - ${error}`);
    }

    const data = await response.json() as AnthropicMessage;
    const call = (data.content ?? []).find(
      (b) => b.type === 'tool_use' && b.name === CLASSIFY_TOOL,
    );

    if (!call || call.input === undefined) {
      const types = (data.content ?? []).map((b) => b.type).join(', ') || 'none';
      throw new Error(
        `Anthropic returned no ${CLASSIFY_TOOL} call despite tool_choice forcing it ` +
          `(model ${this.model}, blocks: ${types}, stop_reason: ${data.stop_reason ?? 'unknown'}).`,
      );
    }

    return {
      // Already an object: the API produced it against the schema, so there is
      // no text to fish JSON out of
      data: schema.parse(call.input),
      rawText: JSON.stringify(call.input),
      model: data.model ?? this.model,
      usage: {
        promptTokens: data.usage?.input_tokens ?? null,
        completionTokens: data.usage?.output_tokens ?? null,
      },
    };
  }
}
