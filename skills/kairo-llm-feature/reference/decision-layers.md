# Changing a decision layer

Four layers decide what happens to an email. Each has its own version and its own guard.

| Layer | Code | Version | Scheme | Guard tests |
|---|---|---|---|---|
| Routing (L2) | `apps/api/src/lib/email/routing-policy.ts` (`resolveRoute`, `SKIP_REASONS`) | `ROUTING_POLICY_VERSION` | `docs/versioning.md` | `apps/api/src/lib/email/pre-filter.test.ts`, `scripts/eval/lib/routing-equivalence.test.ts` |
| Rubric (L3) | `packages/intelligence/prompts/email-classification/{es,en}.md` | heading `— vX.Y.Z` | `packages/intelligence/prompts/README.md` | `packages/intelligence/src/classification/prompt-parity.test.ts` |
| Derivation (L4) | `packages/intelligence/src/classification/derive.ts` (`TYPE_DERIVATION`) | `DERIVATION_VERSION` | `docs/versioning.md` | `scripts/eval/lib/derivation-fit.test.ts` |
| Gate | `apps/api/src/functions/pipeline/{tier1,backfill}-proposal-status.ts` | none | n/a | the sibling `*.test.ts` |

`scripts/eval/lib/routing-equivalence.test.ts` and `derivation-fit.test.ts` read the private corpus under `scripts/eval/data/` and need it present. Never paste what they read into a test name, assertion message or comment.

## Which number moves

**Routing and derivation** (`docs/versioning.md`): the first number stays 1 unless the mechanism is replaced (routing stops being an ordered rule table; `ticket_type` stops being derived from a table).

- Second position (`1.X.0`): a value can never be produced again — a rule that was the only emitter of a `skip_reason` is removed, or a derivation-key value disappears.
- Third position (`1.x.X`): everything else — a rule added, a condition narrowed or widened, a cell remapped, however many messages move.

**Prompts** (`prompts/README.md`), a different scheme:

- X frozen at 1.
- Y: a block rewritten whole, a field the model stops answering, a class that stops existing.
- Z: everything else, including edits that change labels.

The common error in both schemes is spending a bigger position because the change "felt significant" or moved many labels. The test is the vocabulary, not the traffic.

Add a line to the changelog comment under the constant (routing-policy.ts keeps one) and bump **both** `es.md` and `en.md` for a prompt.

## Procedure

1. Measure before editing: find which layer the defect belongs to with `bun run eval:attribute` on an existing run (L2 routing withheld it, L3 an axis was wrong, L4 no cell can reach the label). Editing the rubric for an L4 defect cannot fix it.
2. The labelled sheet is the specification. Fit the rule, the rubric or the table to reproduce it; do not propose relabelling.
3. Make the edit, bump the version by the rule above, update the guard test expectations.
4. Re-run only the cell that measures the change (see `skills/kairo-ai-evaluation/SKILL.md`), and only when the user asks for a run.
5. Persistence: the version is already written with every decision (`routingAudit`, `classificationAudit` in `apps/api/src/lib/classification-audit.ts`). A new layer or version constant needs its own column and helper there, through a migration.
6. A new `skip_reason` goes into `SKIP_REASONS`: the column has no CHECK constraint, so the union is the only thing keeping the vocabulary closed.

## Gates

A gate returns `[status, reason]` from a pure `*Decision` function and emits `ticket.proposal_status` through a wrapper; the reason is a member of `ProposalStatusReason` in `apps/api/src/lib/decision-telemetry.ts`. `abstain` is checked first in every gate. See [selective-automation.md](selective-automation.md).
