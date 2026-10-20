# resizer

## Purpose

Lets the agent change the width of a pane by dragging its edge.

## Variants

- Vertical handle: a 6px hit area on the edge between two panes, centered on the border. Used on the left edge of the triage context panel, which grows by taking width from the reading column only.

## States

- **default**: Invisible; the pane border is the only cue. Cursor `col-resize`.
- **hover**: `accent.soft` fill over the hit area.
- **active**: While dragging, the cursor stays `col-resize` and text selection is off for the whole page.
- **disabled**: Not defined in the approved design.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- `role="separator"` with `aria-orientation`, `aria-valuenow`, `aria-valuemin`, `aria-valuemax` and an `aria-label` naming the pane; focusable.
- Left and right arrows resize by 16px, shift by 64px; home and end jump to the limits; a double press restores the minimum width.
- Focus: `accent.line` fill over the hit area.

## Domain value

The context panel keeps the reading column usable: its width has a floor, a ceiling derived from the space left for the reading column, and is remembered between sessions.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width, so there is nothing to resize.
