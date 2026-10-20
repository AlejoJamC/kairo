# ai-proposal

## Purpose

AI proposal to confirm or reject.

## Variants

- Strip above ticket-bar, only in AI Classification › To review (`surface.panel`, padding 14px 24px, 10px gap, `border.default` bottom border): 13px spark, title "AI proposal" 600, mono 11px model in `text.tertiary`; 26px key–value chips (Type, Category, Priority, Tone; key in `text.tertiary`, value in `text.primary` 500) and a confidence chip with a 14px confidence-ring and the mono value; Confirm (primary, check) and Reject (secondary, ×).
- Confidence is always written with two decimals (0.73), as everywhere in the system, never as a percentage.
- Web compact: card with header, compact property rows and footer with Reject (R) and Confirm (⌘↵).

## States

- **default**: As described in Variants. Missing fields shown as —.
- **hover**: Button hovers.
- **active**: On Confirm or Reject the strip disappears, the ticket leaves To review, the queue selects the next one and a toast says "[ID] · proposal confirmed" or "… rejected".
- **disabled**: While the answer is saved, both buttons are disabled.
- **loading**: While the proposal is computed, the chips are replaced by three 26px pill skeletons (`.shim`) and Confirm and Reject are disabled. After Confirm, the button shows a 12px white spinner until the change is saved.
- **error**: Proposal failed: a bad callout (`role="alert"`) replaces the chips with Retry (secondary); Confirm is hidden and Reject stays to dismiss the strip.

## Accessibility

- Buttons carry their shortcuts in `title`.
- The strip is a region with `aria-label="AI proposal"`; the confidence ring carries its accessible name ("Confidence 0.29").
- After answering, focus moves to the next row of the queue.

## Domain value

The agent always has the last word on an AI proposal; every answer teaches Kairo when it can act on its own. For a welcome email from Acme, the agent confirms internal · general · P3.

## Platforms

- **web**: Triage app in the browser and the public web. Below `layout.breakpoint`, padding 14px 16px and the chips wrap.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: Not designed.
