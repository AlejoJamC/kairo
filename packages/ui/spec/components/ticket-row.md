# ticket-row

## Purpose

One ticket in the queue.

## Variants

- Button of two to three lines, radius row.
- Line 1: priority glyph, mono ID, subject 13px/500 with ellipsis, escalated arrow, mono age.
- Line 2 (22px indent): sentiment face, sender, mention dot, note count tag, compact SLA, message count, confidence ring.
- Line 3 (optional): last reply with Follow up link, or "+1 similar" dashed tag.

## States

- **default**: As described in Variants.
- **hover**: `surface.hover`.
- **active**: Selected: `accent.soft` with `accent.line` inset.
- **disabled**: Not applicable.
- **loading**: Skeleton rows while Tier 2 classifies.
- **error**: Classification failed for the ticket: the confidence ring shows the no-value state and a 12px alert icon in `color.bad-ink` appears with the title "Classification failed"; the row stays selectable.

## Accessibility

- `aria-label` "[ID] [subject]"; every signal carries `title`. The order of signals is fixed.

## Domain value

Combines priority, sentiment, SLA, confidence, notes and mentions for one ticket.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Mobile companion app: full-width list item, min height 64px (touch target at least 44px), padding 12×16, `border.default` divider. Line 1: priority glyph and subject 14px/500 with ellipsis; line 2: sentiment face, sender, compact SLA and confidence ring. Tapping opens the ticket; pressed state `surface.hover`.
