import type { z } from 'zod';
import type { CompletionProvider, CompletionOptions, CompletionMeta } from '../base';

interface AnthropicMessage {
  content: Array<{ text: string }>;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

export class AnthropicCompletionProvider implements CompletionProvider {
  public readonly model = 'claude-sonnet-4-20250514';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
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
        temperature: options.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.statusText} - ${error}`);
    }

    const data = await response.json() as AnthropicMessage;
    const text = data.content[0].text;
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
        temperature: options.temperature ?? 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${response.statusText} - ${error}`);
    }

    const data = await response.json() as AnthropicMessage;
    const text = data.content[0].text;

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    return {
      data: schema.parse(parsed),
      rawText: text,
      model: data.model ?? this.model,
      usage: {
        promptTokens: data.usage?.input_tokens ?? null,
        completionTokens: data.usage?.output_tokens ?? null,
      },
    };
  }
}
