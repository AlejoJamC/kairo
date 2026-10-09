import { embedMany } from 'ai';
import { ProviderError, type EmbeddingProvider } from '../base';
import { GatewayClient, gatewayError } from './client';

export class GatewayEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  private readonly gateway: GatewayClient;

  constructor(apiKey: string, model: string, dimensions = 512) {
    this.gateway = new GatewayClient(apiKey);
    this.model = model;
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    return (await this.embedBatch([text]))[0]!;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!texts.length) return [];
    try {
      await this.gateway.requireModel(this.model, 'embedding');
      const { embeddings } = await embedMany({
        model: this.gateway.sdk.embeddingModel(this.model),
        values: texts,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(120_000),
      });
      if (embeddings.length !== texts.length || embeddings.some((vector) =>
        vector.length !== this.dimensions || vector.some((value) => !Number.isFinite(value)))) {
        throw new ProviderError('Gateway embedding dimensions do not match storage', false);
      }
      return embeddings;
    } catch (error) {
      throw gatewayError(error);
    }
  }
}
