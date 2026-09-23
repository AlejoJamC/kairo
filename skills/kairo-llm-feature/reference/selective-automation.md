# Letting a model output act without a person

Applies to any output that could skip review: a classification proposal auto-approved, a reply auto-sent (`llm_calls.outcome = 'auto_applied'`), a contact draft auto-promoted.

## Order of the checks

First match wins. Each check returns a stated reason.

1. **Abstain → pending.** If the feature has an uncertainty signal that is about this item (ensemble disagreement on the derived label, `abstain` from `classifyEmailWithMeta`), it goes first. A permission earned on average does not override a signal about this item.
2. **Required context missing → pending.** If the feature was measured to be unreliable without some input, its absence blocks automation. Example: `backfill` requires `businessContext` (`apps/api/src/functions/pipeline/backfill-proposal-status.ts`).
3. **Earned permission → auto.** Per account and per class, from the **precision of the prediction** measured over a minimum sample (`ticket_type_auto_approval`: `min_precision` default 0.90, `min_sample_size` default 30). Otherwise pending.

An exception exists only where a person is watching and a benchmark backs it: onboarding auto-approves `support` (`tier1-proposal-status.ts`). Other stages measure their own rule; they do not inherit it.

## Never

- Never gate on the model's self-reported `confidence`. It was measured and does not separate right from wrong (see the comment on `confidence` in `packages/intelligence/src/classification/schema.ts`). It may be stored and displayed; nothing may branch on it.
- Never confuse it with the escalation module's `confidence` (`packages/intelligence/src/escalation/detect.ts`, a severity-weighted score). Name a new quantity after what it measures.
- Never set a permission by hand or hardcode a class as trusted outside the benchmarked exception.
- Never fail open. An unreadable permission table yields no permission (`autoApprovedTypes` returns `[]`).

## What the gate must emit

- A pure `xxxDecision(input): [status, reason]` plus a wrapper that calls `recordDecision("ticket.proposal_status", proposalStatusAttributes({ stage, type, status, reason }))`. Add new reasons to `ProposalStatusReason` in `apps/api/src/lib/decision-telemetry.ts`.
- The stored proposal carries the status, and the correction/outcome path records what the person did, so precision can be computed later.

## The permission has to be earned by something

A gate that reads a permission needs a writer that computes it; otherwise it is a gate that never opens. Before adding a gate, check which job writes its permission table. If no writer exists, say so in the PR instead of assuming the gate works.
