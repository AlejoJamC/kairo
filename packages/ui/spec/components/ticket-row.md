# ticket-row

## Purpose

One ticket in a queue list. The full variant is the queue row of the app; the compact variant is the only queue row of the public web, used in the onboarding wizard.

## Variants

- Base: a column of two to three lines, 6px gap, radius row. Line 1 has no indent; the following lines are indented 22px, aligned with the subject.
- Full (app, a button):
  - Line 1: priority glyph, mono ID, subject 13px/500 with ellipsis, escalated arrow, mono age.
  - Line 2: sentiment face, sender, mention dot, note count tag, compact SLA, message count, confidence ring.
  - Line 3 (optional): last reply with Follow up link, or "+1 similar" dashed tag.
  - The order of signals is fixed.
- Compact (public web, a list item inside a list with a 2px gap):
  - Line 1: 14px priority-glyph, subject 13px/500 in `text.primary` with ellipsis, age in mono 11px `text.tertiary`.
  - Line 2: static category-chip (24px, category dot, lowercase name); on the right, confidence in the numeric confidence-ring variant (mono 11px, tabular figures, two decimals, `text.secondary`, 28px minimum slot). No value: — in `text.tertiary`.
  - No ID, no sender and no other signal (sentiment, mentions, notes, SLA, messages, escalation, grouping).
- Compact usage rules:
  - Only in the onboarding wizard, in two containers: product-frame without the top bar, with up to three rows (examples or the first rows of the classified queue, most urgent first); and the card of recently classified rows while the scan runs, with up to four rows, newest first, each entering with a fade, the card keeping a minimum height while empty.
  - Not a control: it opens nothing, has no hover and no selected state. A row that must open a ticket is the full variant.
  - Never in the app: app queues always use the full variant, short lists included.
  - At most four rows. No queue row in the public web is drawn with its own markup.

## States

- **default**: As described in Variants.
- **hover**: Full: `surface.hover`. Compact: not applicable, it is not interactive.
- **active**: Full, selected: `accent.soft` with `accent.line` inset. Compact: not applicable.
- **disabled**: Not applicable.
- **loading**: Full: skeleton rows while Tier 2 classifies. Compact: no skeleton; during the scan rows appear as they are classified.
- **error**: Full: classification failed for the ticket: the confidence ring shows the no-value state and a 12px alert icon in `color.bad-ink` appears with the title "Classification failed"; the row stays selectable. Compact: confidence shows — in `text.tertiary`; the row stays.

## Accessibility

- Full: `aria-label` "[ID] [subject]"; every signal carries `title`. The order of signals is fixed.
- Compact: the list carries an `aria-label` that says what it holds (for example "Recently classified"). The list is not a live region: rows are not announced one by one during the scan. The glyph is `aria-hidden` and the priority is visually hidden text before the subject ("P1, "); confidence carries visually hidden "Confidence" and a `title`. A row reads as "P1, Duplicate charge on invoice, 2m, billing, Confidence 0.94".
- Tertiary text stays at 4.5:1 or more on `surface.panel`, `surface.hover` and `accent.soft`.

## Domain value

Full: combines priority, sentiment, SLA, confidence, notes and mentions for one ticket. Compact: priority, subject, age, category and confidence; for example P1 "Duplicate charge on invoice", 2m, billing, 0.94.

## Platforms

- **web**: Full: Triage app in the browser. Compact: public web, onboarding wizard.
- **desktop**: Full: Triage desktop app, same component. Compact: not part of the desktop app design.
- **mobile**: Mobile companion app: full-width list item, min height 64px (touch target at least 44px), padding 12×16, `border.default` divider. Line 1: priority glyph and subject 14px/500 with ellipsis; line 2: sentiment face, sender, compact SLA and confidence ring. Tapping opens the ticket; pressed state `surface.hover`. Public web below 980px: rows inside product-frame are hidden with their aside; rows inside the card stay, in one column.
