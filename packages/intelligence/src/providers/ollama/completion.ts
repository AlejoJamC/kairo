import type { z } from 'zod';
import type { CompletionProvider, CompletionOptions } from '../base';

export class OllamaCompletionProvider implements CompletionProvider {
  public readonly model = 'llama3.2';
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
  }

  async complete(prompt: string, options: CompletionOptions = {}): Promise<string> {
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

    const data = await response.json() as { response: string };
    return data.response;
  }

  async completeJSON<T>(prompt: string, schema: z.ZodSchema<T>): Promise<T> {
    const text = await this.complete(prompt, { temperature: 0.3 });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Ollama response');
    }

    const parsed: unknown = JSON.parse(jsonMatch[0]);
    return schema.parse(parsed);
  }
}
