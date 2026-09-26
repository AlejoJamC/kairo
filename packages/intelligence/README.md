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

// Default language is Spanish (current primary tenant).
const result = await classifyEmail({
  subject: "Error 500",
  body: "Sistema caído en producción",
  from: "cliente@acme.com"
});

// Explicit language selection (per-tenant):
const enResult = await classifyEmail(
  { subject: "System down", body: "Nothing works", from: "cto@acme.com" },
  { lang: 'en' },
);

// Output shape (canonical English identifiers — stable IDs, NOT translations):
// {
//   type:       "support" | "prospect" | "spam" | "internal" | "other",
//   priority:   "P1" | "P2" | "P3",
//   category:   "technical" | "billing" | "account" | "general" | "not_applicable",
//   tone:       "aggressive" | "frustrated" | "neutral" | "positive",
//   urgency:    "high" | "medium" | "low",
//   reasoning:  string,    // follows the email's language
//   confidence: number     // 0..1
// }
```

The canonical schema is defined in code (`src/classification/schema.ts`). Per-language prompt bodies live under `prompts/email-classification/<lang>.md`. Adding Portuguese = one new markdown file; no schema duplication.

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

### Decisions (JEV)

A different provider shape: a typed question against a piece of state, answered with a typed value and its own calibrated confidence — not a prompt completed into text. See ADR-029.

```ts
import { createDecisionProvider } from '@kairo/intelligence';
import { choice } from '@typesafe-ai/sdk';

const jev = createDecisionProvider('jev');
const result = await jev.decide({
  state: { document: "I was charged twice" },
  questions: { category: choice("What is this about?", { billing: null, other: null }) },
});
```

`classifyEmailWithJev()` runs a JEV verdict through the same `deriveClassification()` `classifyEmail()` uses — same output shape, different provider underneath.

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

### Decision provider (JEV)

```bash
export TYPESAFE_API_KEY=ts-xxx
export JEV_MODEL=jev-latest   # optional, this is the default
```

## Provider matrix

| Variable               | Value        | Provider                     |
|------------------------|--------------|------------------------------|
| `INTELLIGENCE_PROVIDER`| `ollama`     | Ollama (`llama3.2`)          |
| `INTELLIGENCE_PROVIDER`| `anthropic`  | Claude (`claude-sonnet-4-*`) |
| `EMBEDDING_PROVIDER`   | `ollama`     | Ollama (`nomic-embed-text`)  |
| `EMBEDDING_PROVIDER`   | `voyage`     | Voyage AI (`voyage-2`)       |

`createDecisionProvider(id)` has one entry today: `'jev'` (TypeSafe AI), configured via `TYPESAFE_API_KEY` / `JEV_MODEL` — not gated by an `INTELLIGENCE_*` mode variable, since it's a separate provider shape (`DecisionProvider`), not a `CompletionProvider` variant.

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

See ADR-016 for the original provider abstraction, ADR-029 for the registry and the `DecisionProvider` shape.
