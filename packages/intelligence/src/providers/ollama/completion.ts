import type { z } from 'zod';
import type { CompletionProvider, CompletionOptions, CompletionMeta } from '../base';

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
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 1000,
          stop: options.stopSequences,
        },
      }),
    });

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
    const meta = await this.completeWithMeta(prompt, { temperature: options.temperature ?? 0.3 });

    const jsonMatch = meta.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Ollama response');
    }

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    return {
      data: schema.parse(parsed),
      rawText: meta.rawText,
      model: meta.model,
      usage: meta.usage,
    };
  }
}
