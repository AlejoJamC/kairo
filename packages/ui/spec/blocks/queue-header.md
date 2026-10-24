# queue-header

## Purpose

Header of the queue pane: view title, count, action, filter bar and the empty text of each view.

## Variants

- Title line (`.qhead`, min height `size.header`, padding 14px 12px 0 20px): `<h1>` in `typography.pane-title` · count `.cnt` 12px · flexible space · optional action · at the end, icon button "Hide ticket list" (list icon, tooltip "Hide ticket list ⌘⇧F", `aria-keyshortcuts="Meta+Shift+F"`, `aria-controls` pointing to the list, `aria-expanded="true"`). Hidden, the list comes back from ticket-bar (list hidden variant) or with ⌘⇧F.
- Description (`.qdesc`, optional): 12.5/1.5 in `text.tertiary`, margin 4px 20px 0, `text-wrap: pretty`.
- Bottom bar (`.qbar`), always with a `border.default` bottom border; its content depends on the view.
- Per view:
  - Triage: title "Triage"; count "shown/open" ("6/8"); action secondary button 28px with the spark in `accent.default` and "Classify"; no description; bar with the priority filters of segmented (All, P1, P2, P3) in `role="tablist"`, also by keyboard: P and then 0 (All), 1, 2 or 3.
  - Awaiting customer: title "Awaiting customer"; total count; description "Tickets where you sent a reply and the customer has not answered yet."; plain bar (`.qbar.plain`, 14px).
  - Resolved: title "Resolved"; total count; description "Closed tickets, in read-only mode."; plain bar.
  - Escalated: title "Escalated"; total count; description "Tickets that were escalated and need priority attention."; plain bar.
  - AI Classification: title "AI Classification"; no count; description "What the AI classified on each ticket. Confirming or rejecting each proposal teaches Kairo when it can act on its own."; bar `.qbar.pills` with filter-pill tabs "To review N" and "Approved by the AI N".
- Under the bar, in Triage only, the suggestion callout ("1 ticket seems to be about the same issue.") with a 10px top margin and 12px side margins.
- List: ticket-row list, padding 8px 8px 16px, 2px gap. Line 3 of ticket-row appears only in Awaiting customer ("LAST REPLY" + when + "Follow up →").
- Empty text per view (empty-state, list variant):
  - Triage, no tickets yet: "No tickets yet." / "Checking your recent emails…" with the pulse dot.
  - Triage, all handled: "Inbox clear. Nice work." / "Nothing left in this view."
  - Awaiting customer: "Nothing awaiting." / "When you reply to a ticket, it stays here until the customer answers."
  - Resolved: "No resolved tickets yet." / "Tickets you resolve appear here in read-only mode."
  - Escalated: "Nothing escalated." / "Escalate a ticket from Triage (E) and it appears here."
  - AI Classification, To review: "Nothing to review." / "Every AI proposal has an answer."
  - AI Classification, Approved: "None yet." / "No ticket reaches the auto-resolution threshold ([current threshold]). Adjust it in Settings › Triage Engine."
- Opening a view selects the first row; in Triage, the highest priority. After resolving or replying, the selection moves to the next row.

## States

- **default**: As described in Variants.
- **hover**: Only the bar controls and the action (see segmented, filter-pill, button).
- **active**: The current filter carries `.on`. Changing the filter selects the first row again.
- **disabled**: "Classify" is disabled while classifying.
- **loading**: While classifying, "Classify" shows `.spin` instead of the spark, a toast says "Triage is reading incoming emails…", and the loading skeleton with "Tier 2 classifying…" appears at the end of the list.
- **error**: If classification fails, a toast says so and the button is available again. The count shows — when it could not be computed.

## Accessibility

- The title is the `<h1>` of the view. The count carries visually hidden text ("6 of 8 open tickets").
- Priority filters: `role="tablist"` with `aria-label="Priority"`; each `.vt` is `role="tab"` with `aria-selected`. The priority glyph is decorative; the label P1 / P2 / P3 gives the name.
- "Classify" carries `aria-busy="true"` while it runs.

## Domain value

The agent of Acme Support sees how many open tickets the current filter shows and asks Kairo to classify incoming email with one action.

## Platforms

- **web**: Triage app in the browser, pane of `layout.queue`. Below `layout.breakpoint` it takes the full width and the filter bar scrolls horizontally without wrapping.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
