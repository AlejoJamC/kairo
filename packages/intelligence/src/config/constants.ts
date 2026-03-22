// Completion model names
export const OLLAMA_COMPLETION_MODEL = 'llama3.2' as const;
export const ANTHROPIC_COMPLETION_MODEL = 'claude-sonnet-4-20250514' as const;

// Embedding model names
export const OLLAMA_EMBEDDING_MODEL = 'nomic-embed-text' as const;
export const VOYAGE_EMBEDDING_MODEL = 'voyage-2' as const;

// Embedding dimensions
export const OLLAMA_EMBEDDING_DIMENSIONS = 384 as const;
export const VOYAGE_EMBEDDING_DIMENSIONS = 1536 as const;

// Default base URLs
export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434' as const;

// Default generation params
export const DEFAULT_MAX_TOKENS = 1000 as const;
export const DEFAULT_TEMPERATURE = 0.7 as const;
export const DEFAULT_JSON_TEMPERATURE = 0.3 as const;
