import { describe, expect, it } from 'bun:test';
import { configuredEmbeddingDimensions, STORED_EMBEDDING_DIMENSIONS } from './providers';
import { ProviderConfigurationError } from '../providers/base';

describe('configuredEmbeddingDimensions', () => {
  it('defaults to the stored vector columns', () => {
    expect(configuredEmbeddingDimensions({})).toBe(STORED_EMBEDDING_DIMENSIONS);
    expect(STORED_EMBEDDING_DIMENSIONS).toBe(768);
  });

  it('uses one setting for every provider and keeps the legacy Ollama setting as a fallback', () => {
    expect(configuredEmbeddingDimensions({ EMBEDDING_DIMENSIONS: '1024', OLLAMA_EMBEDDING_DIMENSIONS: '512' })).toBe(1024);
    expect(configuredEmbeddingDimensions({ OLLAMA_EMBEDDING_DIMENSIONS: '512' })).toBe(512);
  });

  it('rejects a value that is not a positive integer as a configuration fault', () => {
    expect(() => configuredEmbeddingDimensions({ EMBEDDING_DIMENSIONS: 'abc' })).toThrow(ProviderConfigurationError);
    expect(() => configuredEmbeddingDimensions({ EMBEDDING_DIMENSIONS: '0' })).toThrow(ProviderConfigurationError);
  });
});
