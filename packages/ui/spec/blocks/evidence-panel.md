# evidence-panel

## Purpose

Decisions and evidence: the typed trace of the AI classification.

## Variants

- Header button with chevron, title, confidence ring and decision summary.
- Rows (18px, 96px, flexible): ok check (accent arrow for routing), key, value, sub-text: Classified, Priority, Confidence, Similar, Decision.
- Footer on `surface.sunken`: spark, Triage Intelligence in `accent.ink`, mono "typed decision · no generated reasoning text".
- Web sample: header with spark, title, ID and time; rows with key in `label` and confidence per decision; footer with Wrong classification?, Reject and Confirm.

## States

- **default**: Expanded.
- **hover**: Not applicable.
- **active**: Collapsed or expanded via the header.
- **disabled**: Not applicable.
- **loading**: Rows are replaced by four skeleton rows (`.shim`, 10px, 45–70% width) and the header ring shows the no-value dotted state.
- **error**: Trace unavailable: the body shows a bad callout with Retry (secondary sm); the footer stays.

## Accessibility

- Header is a `<button aria-expanded>`.

## Domain value

Never shows generated reasoning prose, only typed decisions.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
