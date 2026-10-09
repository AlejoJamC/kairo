import { describe, expect, it } from 'bun:test';
import { OllamaCompletionProvider } from './completion';
import { OllamaEmbeddingProvider } from './embedding';

describe('Ollama network boundary', () => {
  it('accepts loopback and private LAN addresses for local inference', () => {
    for (const endpoint of ['http://localhost:11434', 'http://127.0.0.1:11434', 'http://[::1]:11434', 'http://192.168.1.2:11434']) {
      expect(() => new OllamaCompletionProvider(endpoint)).not.toThrow();
      expect(() => new OllamaEmbeddingProvider(endpoint)).not.toThrow();
    }
  });
  it('rejects public endpoints and embedded credentials before inference', () => {
    for (const endpoint of ['https://acme.com', 'https://8.8.8.8', 'http://user:password@localhost:11434']) {
      expect(() => new OllamaCompletionProvider(endpoint)).toThrow(/AI Gateway/);
      expect(() => new OllamaEmbeddingProvider(endpoint)).toThrow(/AI Gateway/);
    }
  });
});
