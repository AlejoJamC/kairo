# product-frame

## Purpose

Shows the real app inside a frame on the public web, with invented data. Never an illustration.

## Variants

- Frame: radius frame, `border.default`, `surface.panel`, `shadow.frame`, overflow hidden.
- With top bar (landing and pricing): top bar 40px on `surface.sidebar` with three 10px dots in `border.strong` and the route in a mono 11px pill on `surface.panel`. Content: real app components at 1:1 (nav-item, full ticket-row, evidence-panel, prop-row, note-card, status-bar).
- Without top bar (wizard): no top bar, 8px padding, and inside only a list of compact ticket-row items. Nothing else.
- Usage rules for the variant without top bar:
  - Only in the onboarding wizard, inside an aside on `surface.sidebar` that is hidden below 980px.
  - It holds compact ticket-row items only: three at most, from most to least urgent. No titles, notes or shortcuts inside the frame; if the aside carries them, they go outside it.
  - The rows are examples or the first rows of the classified queue; they are never drawn with their own markup.
  - The list of recently classified rows that fills while the scan runs does not go in this frame: it goes in a card.

## States

- **default**: As described in Variants.
- **hover**: Not applicable: neither the frame nor the compact rows are interactive.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable: the content is an example or comes from the classified queue.
- **error**: Not applicable.

## Accessibility

- With top bar: `<figure role="img">` with an `aria-label` describing the view.
- Without top bar: a plain container with no role; the `aria-label` of the row list and of the aside name it, and the rows read as text.
- The top bar dots and the grid background are `aria-hidden`.

## Domain value

The product is shown as it is: real components, invented data.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 980px the mock grid of the variant with top bar collapses to one column and side panels hide; in the wizard the aside holding the variant without top bar is hidden.
