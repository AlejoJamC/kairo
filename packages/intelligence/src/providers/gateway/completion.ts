import { generateText, NoObjectGeneratedError, Output } from 'ai';
import type { z } from 'zod';
import type { CompletionMeta, CompletionOptions, CompletionProvider } from '../base';
import { ProviderError } from '../base';
import { GatewayClient, gatewayError, gatewayProvenance, gatewayProviderOptions, gatewayFetch, warnIfSystemCredential } from './client';

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
        reasoning: options.reasoning,
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
        reasoning: options.reasoning,
        stopSequences: options.stopSequences,
        maxRetries: 0,
        abortSignal: options.abortSignal ? AbortSignal.any([options.abortSignal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
      });
      if (result.finishReason === 'length') throw new ProviderError('Gateway structured output exceeded its token budget', false);
      const data = schema.parse(result.output);
      return { data, ...completionMeta(result, result.text) };
    } catch (error) {
      const recovered = recoverFencedJson(error, schema);
      if (recovered) {
        return {
          data: recovered.data,
          rawText: recovered.text,
          provider: 'gateway',
          model: recovered.model ?? this.model,
          costUsd: null,
          inferenceProvider: null,
          credentialType: null,
          usage: { promptTokens: recovered.promptTokens, completionTokens: recovered.completionTokens },
          tokensPerSecond: null,
        };
      }
      throw gatewayError(error);
    }
  }
}

/**
 * Some models (Kimi among them) wrap the JSON in a markdown code fence, which
 * the structured-output parser rejects although the object is valid. The text
 * the model produced is parsed again here, still against the caller's schema;
 * anything that does not validate stays the error it was.
 */
function recoverFencedJson<T>(error: unknown, schema: z.ZodSchema<T>): {
  data: T; text: string; model: string | undefined; promptTokens: number | null; completionTokens: number | null;
} | null {
  if (!NoObjectGeneratedError.isInstance(error) || error.finishReason === 'length' || !error.text) return null;
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(error.text);
  if (!fenced?.[1]) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(fenced[1]); } catch { return null; }
  const validated = schema.safeParse(parsed);
  if (!validated.success) return null;
  return {
    data: validated.data,
    text: error.text,
    model: error.response?.modelId,
    promptTokens: error.usage?.inputTokens ?? null,
    completionTokens: error.usage?.outputTokens ?? null,
  };
}

function completionMeta(result: {
  response: { modelId: string };
  usage: { inputTokens?: number; outputTokens?: number };
  providerMetadata?: unknown;
}, rawText: string): CompletionMeta {
  const provenance = gatewayProvenance(result.providerMetadata, result.response.modelId);
  warnIfSystemCredential(provenance);
  return {
    rawText,
    provider: 'gateway',
    ...provenance,
    usage: { promptTokens: result.usage.inputTokens ?? null, completionTokens: result.usage.outputTokens ?? null },
    tokensPerSecond: null,
  };
}
