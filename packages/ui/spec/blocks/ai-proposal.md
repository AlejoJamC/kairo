# ai-proposal

## Purpose

AI proposal to confirm or reject.

## Variants

- Strip above the ticket header: spark, title, mono model; key–value chips (Type, Category, Priority, Tone) and a confidence chip; Confirm (primary) and Reject (secondary).
- Web compact: card with header, compact property rows and footer with Reject (R) and Confirm (⌘↵).

## States

- **default**: As described in Variants. Missing fields shown as —.
- **hover**: Button hovers.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: While the proposal is computed, the chips are replaced by three 26px pill skeletons (`.shim`) and Confirm and Reject are disabled. After Confirm, the button shows a 12px white spinner until the change is saved.
- **error**: Proposal failed: a bad callout (`role="alert"`) replaces the chips with Retry (secondary); Confirm is hidden and Reject stays to dismiss the strip.

## Accessibility

- Buttons carry their shortcuts in `title`.

## Domain value

The agent always has the last word on an AI proposal.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
