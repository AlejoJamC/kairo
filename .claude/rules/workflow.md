---
description: Rules for implementing specs and managing git workflow
---

## Before implementing
- Read `specs/pending/[spec-name].md` fully
- If spec is ambiguous, create `specs/questions/[spec-name]-questions.md` and stop — never guess product intent

## Git workflow
- `git status` must be clean before starting
- Create `feature/[spec-name]` branch before touching any file
- Run `bun test` after implementation — fix all failures before stopping
- Never modify `src/intelligence/` without explicit instruction

## Finishing a spec
- Move spec file from `specs/pending/` to `specs/done/`
- Add a brief summary of what changed at the top of the spec file

## Long-running tasks
Use `claude-progress.txt` at repo root to persist progress across context windows:
```
[YYYY-MM-DD] spec: [name] | status: [in-progress|blocked|done] | last action: [what you did]
```
