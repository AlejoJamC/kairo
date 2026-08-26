import { z } from 'zod';
import { fetchOrThrow, type CompletionProvider, type CompletionOptions, type CompletionMeta } from '../base';

interface OllamaGenerateResponse {
  response: string;
  model?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

export class OllamaCompletionProvider implements CompletionProvider {
  public readonly model: string;
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434', model: string = 'llama3.2') {
    this.baseUrl = baseUrl;
    this.model = model;
  }

  async complete(prompt: string, options: CompletionOptions = {}): Promise<string> {
    const { text } = await this.completeWithMeta(prompt, options);
    return text;
  }

  async completeWithMeta(prompt: string, options: CompletionOptions = {}): Promise<{ text: string } & CompletionMeta> {
    return this.request(prompt, options);
  }

  /**
   * `format` accepts a JSON Schema, which Ollama compiles into a decoding
   * grammar: the model cannot emit a token that would break the schema. That
   * turns "please answer with JSON" from a request the model may ignore into
   * a constraint it cannot.
   */
  private async request(
    prompt: string,
    options: CompletionOptions,
    format?: unknown,
  ): Promise<{ text: string } & CompletionMeta> {
    const response = await fetchOrThrow(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        ...(format !== undefined ? { format } : {}),
        // Reasoning models (qwen, deepseek-r1, ...) spend their entire
        // num_predict budget on the separate `thinking` field and return an
        // empty response. Classification is schema-constrained output, not a
        // reasoning task — disable thinking; non-reasoning models ignore it.
        think: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 1000,
          stop: options.stopSequences,
        },
      }),
    }, 'Ollama');

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json() as OllamaGenerateResponse;
    return {
      text: data.response,
      rawText: data.response,
      model: data.model ?? this.model,
      usage: {
        promptTokens: data.prompt_eval_count ?? null,
        completionTokens: data.eval_count ?? null,
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
    const meta = await this.request(
      prompt,
      { temperature: options.temperature ?? 0.3 },
      z.toJSONSchema(schema),
    );

    // Grammar-constrained output is already well-formed JSON, but a model can
    // still stop early on a token budget, so a parse failure is reported with
    // what actually came back instead of a bare "no JSON found".
    let parsed: unknown;
    try {
      parsed = JSON.parse(meta.text);
    } catch {
      throw new Error(
        `Ollama returned output that is not valid JSON despite a schema-constrained ` +
          `request (model ${meta.model}): ${meta.text.slice(0, 200)}`,
      );
    }

    return {
      data: schema.parse(parsed),
      rawText: meta.rawText,
      model: meta.model,
      usage: meta.usage,
    };
  }
}
