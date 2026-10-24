# ticket-bar

## Purpose

Top bar of the ticket: where the agent is, the position in the queue and the ticket status.

## Variants

- Bar (`.tbar`): height `size.header`, padding 0 12px 0 24px, `border.default` bottom border, on `surface.page`, single line, 8px gap. Left to right:
  1. Breadcrumb: current queue name in `.crumb` (12.5px `text.tertiary`, truncates first) · 12px chevron in `text.tertiary` · ticket ID in `.crumb-id` (`typography.mono-id` at 12px/500, `text.primary`).
  2. Position: `.cnt` "n / m" (position in the visible queue list), 4px left margin.
  3. Notes (when the ticket has internal notes): team badge as a button (`button.team`, `size.chip`) with a 9px lock and "1 NOTE" / "N NOTES". Opens the Notes tab of the context panel.
  4. Escalated (when the ticket is escalated): the escalated pill of badge, 9px arrow and "ESCALATED".
  5. Flexible space.
  6. Status: status-chip with its 210px menu, aligned right.
  7. Previous / next: two icon buttons with 15px chevrons, 2px gap, 4px left margin.
- Editable: with status-chip.
- Read only (final status): in place of status-chip, a static chip with an 11px lock and "Read only" in `text.secondary`; no status menu.
- Pending proposal (AI Classification): the bar sits under ai-proposal, otherwise identical.
- List hidden (⌘⇧F, queue views only): the ticket list does not resize; it is shown or hidden whole, and hidden it gives its `layout.queue` width back to the ticket. The left padding stays 24px; J, K and the previous / next buttons keep working.
  - Before the breadcrumb: icon button "Show ticket list" with the list icon, tooltip "Show ticket list ⌘⇧F", `aria-keyshortcuts="Meta+Shift+F"`, `aria-controls` pointing to the list and `aria-expanded="false"`.
  - The queue name becomes a switcher: ghost button 26px, padding 0 8px, 12.5px in `text.tertiary`, with an 11px down chevron. It opens a popover (`role="dialog"`) of `layout.queue` width, 34px below the button and 8px to its left:
    - header (padding 10px 12px 8px 14px, `border.default` bottom border): queue name 600 · count `.cnt` · flexible space · `.qbtn.xs` "Pin list" with kbd ⌘⇧F, which shows the list again;
    - 38px menu rows (max height 360px with scroll): 12px priority-glyph · mono ID 11.5px `text.tertiary` · subject in `text.primary` with ellipsis · mono age 11px `text.tertiary`; the current ticket `.on` with `aria-current="true"`;
    - footer (`surface.sunken`, 11px `text.tertiary`): J K navigate · esc close.

## States

- **default**: As described in Variants.
- **hover**: "N NOTES" strengthens its ring to `notes.label`; status-chip and icon buttons as in their components.
- **active**: With the status menu open, the chip stays in hover and the menu sits on top. With the queue switcher open, its button carries `.on`.
- **disabled**: Previous on the first row and Next on the last row are disabled (opacity 0.6).
- **loading**: While the status changes, the chip shows the chosen value at once; a toast confirms "[ID] → Acknowledged".
- **error**: If the status change fails, the chip returns to the previous value and a toast explains it.

## Accessibility

- The breadcrumb is a `<nav aria-label="Path">` with the ID as `aria-current="page"`.
- The position carries visually hidden text "Ticket 1 of 6".
- "N NOTES" carries `aria-label` "View N internal notes". The escalated pill is text, never color only.
- Previous / next: `aria-label` "Previous ticket" / "Next ticket" and `title` "K" / "J". J and K work while the bar has no focus.

## Domain value

The agent of Acme Support knows at a glance that the open ticket is the first of six in Triage, has one internal note and is escalated.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the queue sits above the ticket; the bar keeps everything except the position, and the breadcrumb truncates before the status.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
