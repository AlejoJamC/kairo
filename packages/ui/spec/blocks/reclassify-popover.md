# reclassify-popover

## Purpose

Correction of the AI classification; every correction teaches Triage.

## Variants

- Popover with `role="dialog"`, 290px wide, padding 12px, 10px gap. Opens from "Wrong classification?" in ticket-heading and from "Correct" on the Classified row of evidence-panel.
- Content, top to bottom: title "Correct the classification" 600 · explanation 12/1.45 in `text.tertiary`: "Pick the labels that fit. Triage learns from every correction." · category-chip buttons (flex with wrap, 6px gap), one per available type and category; chosen ones `.on` · footer aligned right, 6px gap: Cancel (`.qbtn`) and Save correction (`.pbtn.sm`).
- Opened from evidence-panel, it anchors to the row, aligned to the left of the value.

## States

- **default**: On open, the current types and categories of the ticket are chosen.
- **hover**: Unchosen chips take `border.strong` and `text.primary`.
- **active**: Pressing a chip toggles its `.on`.
- **disabled**: Save correction is disabled while the selection equals the current one or is empty.
- **loading**: On save, the button shows `.spin` and the popover closes on confirmation. A toast says "Correction saved — Triage learns from it" and the Classified row of evidence-panel shows "corrected by you".
- **error**: If saving fails, the popover stays open with a bad callout above the footer ("The correction could not be saved. Try again.").

## Accessibility

- `role="dialog"` with `aria-labelledby` pointing to the title. Focus goes to the first chip; esc closes without saving and returns focus to the trigger.
- Each chip is a `<button aria-pressed>`. The group carries `role="group"` and `aria-label="Categories"`.
- The trigger carries `aria-haspopup="dialog"` and `aria-expanded`.

## Domain value

When the AI labels a billing question from support@acme.com as technical, the agent switches the chip to billing and saves.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint`, at most the panel width minus 32px.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
