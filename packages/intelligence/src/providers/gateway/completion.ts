import { generateText, Output } from 'ai';
import type { z } from 'zod';
import type { CompletionMeta, CompletionOptions, CompletionProvider } from '../base';
import { GatewayClient, gatewayError, gatewayProvenance, gatewayProviderOptions, gatewayFetch } from './client';

export class GatewayCompletionProvider implements CompletionProvider {
  readonly model: string;
  readonly gateway: GatewayClient;

  constructor(apiKey: string, model: string, transport: typeof fetch = gatewayFetch) {
    this.model = model;
    this.gateway = new GatewayClient(apiKey, transport);
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    return (await this.completeWithMeta(prompt, options)).text;
  }

  async completeJSON<T>(prompt: string, schema: z.ZodSchema<T>, options?: CompletionOptions): Promise<T> {
    return (await this.completeJSONWithMeta(prompt, schema, options)).data;
  }

  async completeWithMeta(prompt: string, options: CompletionOptions = {}): Promise<{ text: string } & CompletionMeta> {
    try {
      await this.gateway.requireModel(this.model, 'language');
      const result = await generateText({
        model: this.gateway.sdk.languageModel(this.model),
        providerOptions: gatewayProviderOptions(this.model),
        prompt,
        maxOutputTokens: options.maxTokens ?? 1000,
        stopSequences: options.stopSequences,
        maxRetries: 0,
        abortSignal: options.abortSignal ? AbortSignal.any([options.abortSignal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
      });
      return { text: result.text, ...completionMeta(result, result.text) };
    } catch (error) {
      throw gatewayError(error);
    }
  }

  async completeJSONWithMeta<T>(
    prompt: string, schema: z.ZodSchema<T>, options: CompletionOptions = {},
  ): Promise<{ data: T } & CompletionMeta> {
    try {
      await this.gateway.requireModel(this.model, 'language');
      const result = await generateText({
        model: this.gateway.sdk.languageModel(this.model),
        providerOptions: gatewayProviderOptions(this.model),
        prompt,
        output: Output.object({ schema }),
        maxOutputTokens: options.maxTokens ?? 1000,
        stopSequences: options.stopSequences,
        maxRetries: 0,
        abortSignal: options.abortSignal ? AbortSignal.any([options.abortSignal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
      });
      const data = schema.parse(result.output);
      return { data, ...completionMeta(result, result.text) };
    } catch (error) {
      throw gatewayError(error);
    }
  }
}

function completionMeta(result: {
  response: { modelId: string };
  usage: { inputTokens?: number; outputTokens?: number };
  providerMetadata?: unknown;
}, rawText: string): CompletionMeta {
  return {
    rawText,
    provider: 'gateway',
    ...gatewayProvenance(result.providerMetadata, result.response.modelId),
    usage: { promptTokens: result.usage.inputTokens ?? null, completionTokens: result.usage.outputTokens ?? null },
    tokensPerSecond: null,
  };
}
