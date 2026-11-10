# scroll-jump

## Purpose

Takes the reader to the end of a long scrollable area, and back to its start once they are at the end.

## Variants

- Down: chevron pointing down, shown while there is content below the visible part.
- Up: chevron pointing up, shown when the end has been reached.
- Round, 34px, 1px `border.default`, `surface.panel`, `shadow.xs`, icon 16px in `text.secondary`. Pinned 20px from the right and 16px from the bottom of the scrollable area.
- Drawn only when the area scrolls; with no overflow nothing is shown.

## States

- **default**: As described in Variants.
- **hover**: `surface.hover`, `border.strong` and the icon in `text.primary`.
- **active**: `surface.sunken`.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- A real `<button>` with `aria-label` and the same text in `title`: "Go to the end of the conversation" or "Go to the start".
- The caller scrolls with smooth motion unless the person asked for reduced motion.

## Domain value

Used in the ticket thread, where a long conversation otherwise has to be dragged to its end after every ticket change.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
