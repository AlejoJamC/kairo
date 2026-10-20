# rich-text

## Purpose

Inline marks shared by the assistant, thread, notes and notifications.

## Variants

- Bold (`.b`): 600 in `text.primary`.
- Code (`.code`): mono 12px on `surface.hover`, radius xs; IDs and order numbers.
- Mention (`.mchip`): mentions scale; `.mchip.me` for the current user.
- Paragraph and bullet (4px accent dot).

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Writing: text appears progressively with the caret at the end of the last visible block.
- **error**: Not applicable.

## Accessibility

- Marks keep semantic HTML (`strong`, `code`).

## Domain value

AI answers, customer thread, internal notes and mention excerpts.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
