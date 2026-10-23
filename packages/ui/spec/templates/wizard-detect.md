# wizard-detect

## Purpose

Onboarding step 2: scan the connected inbox and show what was found.

## Variants

- Header: top-nav wizard header with the stepper on step 2 of 3 (Connect completed) and Exit (ghost button).
- Main column, 760px max, 28px gap, top to bottom:
  - Mono eyebrow "Step 2 of 3 · support@acme.com", title and body text inside a polite live region. While scanning: "Reading your inbox…" and the range, last 30 days, in under 60 seconds. When done: "Done. Your inbox is sorted." and a prompt to start with what is urgent.
  - progress-bar with the percentage on the left and the status on the right.
  - Primary action below the bar, large: disabled with a spinner and "Classifying…" while the scan runs; "See my Triage" with an arrow icon when it ends, leading to the last step. The action sits above the counts so it is reachable without scrolling.
  - kpi-strip, web variant, in a card with three cells: Emails read, Tickets created, Urgent. Mono 30px counts; the urgent count in `color.bad-ink`.
  - Two columns: "Detected categories" as static chip items, each with a category dot and a mono count; "Recently classified" as a card (padding 6px, minimum height 180px) with up to four compact ticket-row items, newest first, each entering with a fade.

## States

- **default**: Scan complete: 100%, "complete" in `color.ok-ink`, final counts, See my Triage enabled.
- **hover**: As in button.
- **active**: Not applicable.
- **disabled**: The action is disabled while classifying.
- **loading**: Classifying: the bar fills, the status reads "classifying…" with a pulse in `accent.ink`, counts rise and rows appear as they are classified.
- **error**: The scan stops: the progress-bar error state with Retry; counts and rows keep their last values and the action stays disabled.

## Accessibility

- Progress bar with `role="progressbar"`, `aria-valuemin`, `aria-valuemax` and `aria-valuenow`.
- Only the title region is live; the list of recently classified rows is not, so each row is not announced.
- The disabled action carries `aria-busy="true"` while classifying.

## Domain value

Example totals: 234 emails read, 89 tickets created, 2 urgent. Categories: billing, technical, account, lead, support, spam.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 980px the two columns stack into one; below 720px the page margin is 16px and stepper labels are hidden visually.
