# @kairo/intelligence

AI intelligence layer: email classification and embedding generation with provider abstraction.

## Installation

```bash
cd packages/intelligence
bun install
```

## Usage

### Classification

```ts
import { classifyEmail } from '@kairo/intelligence';

const result = await classifyEmail({
  subject: "Error 500",
  body: "Sistema caído en producción",
  from: "cliente@acme.com"
});

// result: { tipo, prioridad, categoria, sentimiento, razonamiento, confianza }
```

### Embeddings

```ts
import { generateEmbedding, generateEmbeddings } from '@kairo/intelligence';

const vector = await generateEmbedding("Error 500 en producción");
const vectors = await generateEmbeddings(["Email 1", "Email 2"]);
```

### Direct provider access

```ts
import { createCompletionProvider, createEmbeddingProvider } from '@kairo/intelligence';

const llm = createCompletionProvider();
const text = await llm.complete("Summarize this email...");

const embedder = createEmbeddingProvider();
const vec = await embedder.embed("Some text");
```

## Configuration

### Local dev (Ollama)

```bash
export INTELLIGENCE_PROVIDER=ollama
export EMBEDDING_PROVIDER=ollama
export OLLAMA_BASE_URL=http://localhost:11434   # optional, this is the default
```

Required models:
```bash
ollama pull llama3.2
ollama pull nomic-embed-text
```

### Production (Claude + Voyage)

```bash
export INTELLIGENCE_PROVIDER=anthropic
export ANTHROPIC_API_KEY=sk-ant-xxx
export EMBEDDING_PROVIDER=voyage
export VOYAGE_API_KEY=pa-xxx
```

## Provider matrix

| Variable               | Value        | Provider                     |
|------------------------|--------------|------------------------------|
| `INTELLIGENCE_PROVIDER`| `ollama`     | Ollama (`llama3.2`)          |
| `INTELLIGENCE_PROVIDER`| `anthropic`  | Claude (`claude-sonnet-4-*`) |
| `EMBEDDING_PROVIDER`   | `ollama`     | Ollama (`nomic-embed-text`)  |
| `EMBEDDING_PROVIDER`   | `voyage`     | Voyage AI (`voyage-2`)       |

## Testing

```bash
# Start Ollama
ollama pull llama3.2
ollama pull nomic-embed-text
ollama serve

# Run tests
cd packages/intelligence
bun test
```

See ADR-016 for full architecture details.
