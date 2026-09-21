# Prompt Management Guide

This directory contains LLM prompts used by the intelligence layer.

## Prompt Versioning

Prompts are business logic. They are versioned in git and reviewed via PR.

### Version Format

`X.Y.Z`, and **it is not semver.** Read the rule below, not your instincts.

**X is frozen at 1.** It was bumped to 2.0.0 and then 3.0.0 during development
and reset to 1.2.0 in `1c0a2e8`; that reset is the correct state, not a mistake
to undo. A prompt edit never touches the first number.

Freezing X removes a position, so the other two shift up in meaning. There are
three kinds of change and only two positions left, so the bottom two merge:

| Position | Role | When |
|---|---|---|
| **X** — `1`.y.z | frozen | never |
| **Y** — 1.`Y`.z | **the major** | A block rewritten end to end. A field the model stops answering. A class that stops existing. Something radical, with unequivocal evidence that it is radical. |
| **Z** — 1.y.`Z` | **medium and minor, merged** | Everything else. A new rule, a changed threshold, a redefined class, reworded prose, reordered sections — all of it. |

**The common error is spending Y on an edit that changes some email's answer.**
That is not the test. A rule that moves labels is still a rule, and rules live
in Z. The question for Y is only: *did a block disappear, or get replaced
whole?* If not, it is a Z.

Worked examples from this file's history:

| Change | Version | Why |
|---|---|---|
| The envelope-facts block is added and one bullet is reworded — 3 changed lines | 1.4.1 → **1.4.2** | Labels moved, but nothing was replaced. A rule edit is a Z, however much it moves |
| The `type` section is deleted and replaced by two sections, one per orthogonal axis; the model stops emitting `type` at all | 1.4.2 → **1.5.0** | A block gone and a field removed from the model's answer. This is what Y is for |

Versions before 1.4.1 were numbered by reading Y and Z as semver's minor and
patch. That reading was wrong and is not a precedent.

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
