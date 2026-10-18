# empty-state

## Purpose

Explains an empty view and the next step.

## Variants

- List empty: mono ◌ glyph in `border.strong`, 14px/500 title, 12.5/1.5 explanation (max 260px), pulse dot while scanning.
- No selection: 44px icon, "Select a ticket to see its details", J K hint.
- Pending: dashed container with bracketed text.

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Scanning: pulse dot before the explanation.
- **error**: Load error: same layout with an alert glyph in `color.bad-ink`, a title, the explanation and Retry (secondary).

## Accessibility

- Text only; no illustrations or emoji.

## Domain value

Empty inbox, no internal notes yet, no mentions, no clients matching the filters.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
