# Prompt Management Guide

This directory contains LLM prompts used by the intelligence layer.

## Prompt Versioning

Prompts are business logic. They are versioned in git and reviewed via PR.

### Version Format

**The major is frozen at 1 until this ships to production. There is no 2.x.**
It was bumped to 2.0.0 and then 3.0.0 during development and reset to 1.2.0 in
`1c0a2e8`; that reset is the correct state, not a mistake to undo. A prompt
edit never touches the first number.

The remaining two are decided by **what moves for the consumer**, not by how
much of the file changed. Every edit reads as a "refined instruction", so a
rule written that way spends the minor on everything and the number climbs
forever while saying nothing.

- **Minor** (1.3.0 → 1.4.0): the same email now gets a different value in some
  field. A new rule, a changed threshold, a class redefined.
- **Patch** (1.3.0 → 1.3.1): wording, ordering, examples, an instruction made
  conditional or clearer — the label a given email receives does not change.

The test is mechanical: if you cannot name an email whose returned JSON changes,
it is a patch.

Worked examples from this file's history:

| Change | Version | Why |
|---|---|---|
| `frustrated` gains the thread-position rule | 1.2.0 → **1.3.0** | Emails that were `neutral` come back `frustrated` |
| The confidence penalty for a missing field becomes conditional | 1.3.0 → **1.3.1** | Same labels; only the wording of when to lower a number |

### Making Changes

1. Edit the prompt file
2. Update version in frontmatter
3. Update `date` field
4. Test with sample emails (see Testing section)
5. Create PR with clear description of changes
6. Get review from product owner

### Testing Prompts

```bash
# Run prompt against test emails (requires Ollama or set INTELLIGENCE_PROVIDER / keys)
cd packages/intelligence
bun test src/classification/classify.test.ts

# Skip LLM integration tests (e.g. CI without a local model)
SKIP_LLM_INTEGRATION=1 bun test src/classification/classify.test.ts

# Manual testing with Ollama
ollama run llama3.2 "$(cat prompts/email-classification.md)"
```

## Directory Structure

Each prompt lives in its own subdirectory named after the prompt. Inside, one markdown file per supported language:

```
prompts/
  email-classification/
    en.md   ← English prompt body
    es.md   ← Spanish prompt body
  reply-suggestion/
    en.md
    es.md
```

## File Format

All prompt files use markdown with YAML frontmatter:

```markdown
---
version: 1.0.0
author: Your Name
date: 2026-03-29
model: claude-sonnet-4-20250514
fallback_model: llama3.2
description: Short description
---

# Prompt Title

[Prompt content here with {{placeholders}}]
```

## Placeholder Syntax

Use `{{variable}}` for template variables. The prompt loader replaces these at runtime.

Example:
- `{{from}}` → Replaced with email sender
- `{{subject}}` → Replaced with email subject
- `{{body}}` → Replaced with email body

## Current Prompts

| Directory | Purpose | Languages |
|-----------|---------|-----------|
| `email-classification/` | Classify support emails by type, priority, category, tone, urgency | `en`, `es` |
| `reply-suggestion/` | Suggest AI draft replies for tickets | `en`, `es` |

## Planned Prompts

- `email-summarization/` — Generate ticket summaries
- `knowledge-search/` — Semantic search query reformulation
