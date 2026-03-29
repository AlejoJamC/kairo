# Prompt Management Guide

This directory contains LLM prompts used by the intelligence layer.

## Prompt Versioning

Prompts are business logic. They are versioned in git and reviewed via PR.

### Version Format

Prompts use semantic versioning in frontmatter:
- **Major** (1.0.0 → 2.0.0): Breaking change in output schema or behavior
- **Minor** (1.0.0 → 1.1.0): Improved accuracy, new examples, refined instructions
- **Patch** (1.0.0 → 1.0.1): Typo fixes, clarifications

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

## File Format

All prompts use markdown with YAML frontmatter:

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

| File | Purpose | Version | Model |
|------|---------|---------|-------|
| email-classification.md | Classify support emails | 1.0.0 | claude-sonnet-4 |

## Future Prompts

- `email-summarization.md` - Generate ticket summaries
- `response-suggestion.md` - Suggest reply templates
- `knowledge-search.md` - Semantic search queries
