# category-chip

## Purpose

Shows the ticket type or category.

## Variants

- Neutral chip (`.chip`, `size.chip`, `surface.panel`, `border.default`) with a 7px dot in the scale color and the lowercase name in 12px `text.secondary`. One size in every screen: 24px.
- Static (`<span class="chip">`): in ticket-heading, after the priority chip, in classification order.
- Static with count: the name followed by the number of tickets in mono 11px `text.tertiary`. For lists of detected categories (onboarding wizard), wrapping onto several lines with a 6px gap.
- Static in the compact ticket-row: on line 2, without count.
- As buttons (`button.chip`, `.on` when chosen) in reclassify-popover: `accent.soft` with `accent.line`, text in `accent.ink`; the dot keeps its color.

## States

- **default**: As described in Variants.
- **hover**: Button chips only: `border.strong` and `text.primary`.
- **active**: Chosen: chip `.on`.
- **disabled**: On read-only tickets the chips are static: opacity 0.6 for button chips and no hover.
- **loading**: While there is no classification, ticket-heading shows `.shim` instead of the chips.
- **error**: Not applicable.

## Accessibility

- The name is always visible; color is never the only cue. The dot is `aria-hidden`.
- Button chips are `<button aria-pressed>`.
- `text.secondary` on `surface.panel` is 7.7:1; `accent.ink` on `accent.soft` is 4.64:1.

## Domain value

TicketType: support, prospect (labeled Lead), spam, internal, other. TicketCategory: technical, billing, account, general, not_applicable. Dot colors come from the `ticketType` and `category` scales.

## Platforms

- **web**: Triage app in the browser, and the public web onboarding wizard (static with count, and in the compact ticket-row). Below `layout.breakpoint` the chips wrap to several lines.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
