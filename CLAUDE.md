# CLAUDE.md

> **Start here:** Read `PROJECT.md` in full before doing anything else.
> Everything about Kairo's architecture, conventions, and boundaries lives there.

---

## Claude Code — Specific Behavior

### Before implementing anything
- Read the target spec in `specs/pending/[spec-name].md`
- If the spec is ambiguous, create a `specs/questions/[spec-name]-questions.md`
  and stop — do not guess intent on product decisions

### Autonomous mode defaults
- Always start from a clean git state (`git status` must be clean)
- Create branch `feature/[spec-name]` before touching any file
- Run `bun test` after implementation — fix failures before stopping
- Never modify files in `src/intelligence/` without explicit instruction

### Memory
Use `claude-progress.txt` at root for long-running tasks spanning multiple
context windows. Format:
```
[YYYY-MM-DD] spec: [name] | status: [in-progress|blocked|done] | last action: [what you did]
```

### MCP — Linear Integration
When a Linear issue is referenced, treat the issue description as the spec.
Acceptance criteria in Linear = done criteria here.

### Subagents available
- Use a read-only explore pass before implementing to map affected files
- Use a plan pass (shift+tab) for any spec touching more than 3 files
