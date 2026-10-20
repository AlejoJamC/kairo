# evidence-panel

## Purpose

Decisions and evidence: the typed trace of the AI classification.

## Variants

- Panel (`.ev`): `border.default`, `radius.panel`, `surface.panel`, `shadow.xs`, after ticket-heading.
- Header (`.ev-head`, button, padding 12px 14px): 14px chevron that rotates 90° when open · title "Decisions and evidence" 500 · flexible space · 16px confidence-ring with the overall confidence · decision summary in 12.5px `text.secondary` with ellipsis ("Routed to a person" or "Confidence 0.73").
- Rows (`.ev-rows`, `border.default` top border, padding 6px 14px 10px). Each row (`.evrow`) is a grid `18px 96px minmax(0, 1fr) auto`, min height 32px, 12.5px:
  1. 14px icon: `color.ok` check on decisions, `accent.default` arrow on the routing decision;
  2. key in `text.tertiary`;
  3. value (mono when it is data; mono `.lnk` when it opens another ticket) + sub-text in `text.tertiary` with ellipsis ("corrected by you", "changed by you", "likely the same issue", "no history with this client yet");
  4. side column (`.aside`, right aligned, 6px gap): row confidence and row action, both optional.
- Rows: Classified (types and categories joined by "·"; row confidence when the engine gives it; action "Correct" opens reclassify-popover anchored to the row) · Priority (mono P1; row confidence when given; action "Change" opens the priority menu of ticket-heading anchored to the row) · Confidence (14px confidence-ring + mono value, the overall confidence; no action) · Similar (ticket ID as mono `.lnk` or "None"; row confidence when given; action "Group" when there is a similar ticket not grouped yet) · Decision ("Routed to a person" or —; no action).
- Row confidence: 14px confidence-ring in the active mode (ring or number), same color band (> 0.90 `color.ok`, 0.70–0.90 `color.warn`, < 0.70 `color.bad`). Without a value from the engine the column stays empty; a ring without a value is not shown.
- Row action: `.qbtn.xs` in `text.tertiary` (`text.primary` on hover), always visible, at most one per row. Row actions do the same as their counterparts in the ticket header; no action exists only here.
- Read only (final status): no row actions; the side column shows confidences only.
- Footer on `surface.sunken`: spark, Triage Intelligence in `accent.ink`, mono "typed decision · no generated reasoning text".
- Web sample: header with spark, title, ID and time; rows with key in `label` and confidence per decision in the side column; footer with Wrong classification?, Reject and Confirm.

## States

- **default**: Expanded.
- **hover**: The header keeps its background; row actions take `surface.hover`.
- **active**: Collapsed or expanded via the header. With a popover opened from a row, its action stays in hover. After a correction or change, the row sub-text reads "corrected by you" or "changed by you" and its row confidence is removed: the value is a human decision.
- **disabled**: "Group" is not shown when the ticket is grouped; in read-only mode there are no row actions.
- **loading**: Rows are replaced by four skeleton rows (`.shim`, 10px, 45–70% width) and the header ring shows the no-value dotted state.
- **error**: Trace unavailable: the body shows a bad callout with Retry (secondary sm); the footer stays.

## Accessibility

- Header is a `<button aria-expanded>` with `aria-controls` pointing to the rows.
- Rows are a description list: key in `<dt>`, value, confidence and action in `<dd>`.
- Row confidence carries its accessible name ("Confidence 0.92"). Each action names its row in `aria-label` ("Correct classification", "Change priority", "Group with [ID]").

## Domain value

Never shows generated reasoning prose, only typed decisions. For a ticket from support@acme.com the agent sees support · technical at 0.92, corrects it in the row, and groups it with the similar ticket.

## Platforms

- **web**: Triage app in the browser and the public web. Below `layout.breakpoint` the grid becomes `18px 84px minmax(0, 1fr) auto` and the sub-text is hidden when it does not fit.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: Not designed.
