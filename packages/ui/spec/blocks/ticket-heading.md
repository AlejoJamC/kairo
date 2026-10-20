# ticket-heading

## Purpose

Head of the ticket content: subject, editable classification and SLA.

## Variants

- Placed at the start of the reading column (`layout.reading`, padding 28px 32px), before evidence-panel, with a 12px gap between its three lines.
- Subject: `<h2 class="ttitle">` in `typography.ticket-title`, `text-wrap: pretty`.
- Classification (flex with wrap, 6px gap):
  - Priority chip: `button.chip` in `text.primary` with a 12px priority-glyph, mono 11.5px/500 label ("P1") and an 11px chevron in `text.tertiary`. Opens the priority menu: 170px popover, padding 6px, 30px under the chip, with menu items (12px glyph + mono label) and `.on` on the current one.
  - One category-chip per type or category, in classification order.
  - "Wrong classification?": ghost button `.qbtn.xs` in `text.tertiary` with a 12px flag. Opens reclassify-popover.
- SLA (when the SLA is known): sla-indicator, full variant.
- Editable: as above.
- Read only (final status): the priority chip is a static `<span class="chip">` without chevron or menu, and there is no "Wrong classification?".

## States

- **default**: As described in Variants.
- **hover**: The priority chip takes `border.strong`; "Wrong classification?" takes `surface.hover` with `text.primary`.
- **active**: With the menu or the popover open, the trigger stays in hover. Choosing another priority changes the glyph at once, a toast says "[ID] priority → P2", and the Priority row of evidence-panel shows "changed by you".
- **disabled**: Read-only variant: no interaction.
- **loading**: No classification yet: two `.shim` bars of 24×64px instead of the chips.
- **error**: If the priority change fails, it returns to the previous value and a toast explains it.

## Accessibility

- The subject is the `<h2>` of the ticket.
- Priority chip: `aria-haspopup="menu"`, `aria-expanded` and `aria-label` "Priority P1, change". The menu is `role="menu"` with `role="menuitemradio"` and `aria-checked`; arrows move, ↵ chooses, esc closes.
- Category chips are text; the color dot is decorative.

## Domain value

For a message from support@acme.com, the agent reads the subject, sees P1 support · technical and how long the first response has been overdue, and corrects any of them in place.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint`, padding 20px 16px and the chips wrap to several lines.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
