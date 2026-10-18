# category-chip

## Purpose

Shows the ticket type or category.

## Variants

- Neutral chip with a 7px dot in the scale color and the lowercase name.
- As buttons (`.on` when chosen) in the Correct classification popover.

## States

- **default**: As described in Variants.
- **hover**: Chip hover.
- **active**: Chosen: chip `.on`.
- **disabled**: On read-only tickets the chips are static: opacity 0.6 for button chips and no hover.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- The name is always visible; color is never the only cue.

## Domain value

TicketType: support, prospect (labeled Lead), spam, internal, other. TicketCategory: technical, billing, account, general, not_applicable. Dot colors come from the `ticketType` and `category` scales.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
