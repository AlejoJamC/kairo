# loading

## Purpose

Shows that something is in progress. Includes the skeleton.

## Variants

- Skeleton (`.shim`): 10–12px bars at 45–70% width, 1.4s shimmer, radius xs; with a mono status line and a pulse dot while Tier 2 classifies.
- Pulse (`.pulse`): 5–6px dot, 1.6s, for live states.
- Spinner (`.spin`): 11px, 0.8s; `.lg` 28px.
- Caret (`.caret`): 7×14px accent bar, 1s blink, while the AI writes.

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: This component is the loading state.
- **error**: Not applicable.

## Accessibility

- All animations stop with `prefers-reduced-motion`.
- Live regions announce the status text, not the animation.

## Domain value

Tier 2 classifying, live queue, AI thinking and writing, scan in progress.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
