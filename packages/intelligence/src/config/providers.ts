import { z } from 'zod';
import type { CompletionProvider, EmbeddingProvider } from '../providers/base';
import { OllamaCompletionProvider } from '../providers/ollama/completion';
import { OllamaEmbeddingProvider } from '../providers/ollama/embedding';
import { AnthropicCompletionProvider } from '../providers/anthropic/completion';
import { VoyageEmbeddingProvider } from '../providers/voyage/embedding';
import { OLLAMA_DEFAULT_BASE_URL } from './constants';

const CompletionConfigSchema = z.object({
  completionMode: z.enum(['ollama', 'anthropic']).default('ollama'),
  ollamaBaseUrl: z.string().url().optional(),
  anthropicApiKey: z.string().optional(),
});

const EmbeddingConfigSchema = z.object({
  embeddingMode: z.enum(['ollama', 'voyage']).default('ollama'),
  ollamaBaseUrl: z.string().url().optional(),
  voyageApiKey: z.string().optional(),
});

export function createCompletionProvider(): CompletionProvider {
  const config = CompletionConfigSchema.parse({
    completionMode: process.env['INTELLIGENCE_PROVIDER'] ?? 'ollama',
    ollamaBaseUrl: process.env['OLLAMA_BASE_URL'],
    anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
  });

  switch (config.completionMode) {
    case 'anthropic':
      if (!config.anthropicApiKey) {
        throw new Error('ANTHROPIC_API_KEY required when INTELLIGENCE_PROVIDER=anthropic');
      }
      return new AnthropicCompletionProvider(config.anthropicApiKey);

    case 'ollama':
    default:
      return new OllamaCompletionProvider(
        config.ollamaBaseUrl ?? OLLAMA_DEFAULT_BASE_URL
      );
  }
}

export function createEmbeddingProvider(): EmbeddingProvider {
  const config = EmbeddingConfigSchema.parse({
    embeddingMode: process.env['EMBEDDING_PROVIDER'] ?? 'ollama',
    ollamaBaseUrl: process.env['OLLAMA_BASE_URL'],
    voyageApiKey: process.env['VOYAGE_API_KEY'],
  });

  switch (config.embeddingMode) {
    case 'voyage':
      if (!config.voyageApiKey) {
        throw new Error('VOYAGE_API_KEY required when EMBEDDING_PROVIDER=voyage');
      }
      return new VoyageEmbeddingProvider(config.voyageApiKey);

    case 'ollama':
    default:
      return new OllamaEmbeddingProvider(
        config.ollamaBaseUrl ?? OLLAMA_DEFAULT_BASE_URL
      );
  }
}
