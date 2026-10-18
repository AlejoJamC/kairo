# filter-pill

## Purpose

Filters a data page.

## Variants

- Pill (`.pill`): 30px, pill radius, `border.default`, 12.5px `text.secondary`, count inside at opacity 0.65.

## States

- **default**: As described in Variants.
- **hover**: `text.primary`, `border.strong`.
- **active**: Inverted: `text.primary` fill, `surface.page` text.
- **disabled**: Opacity 0.6, no hover, `aria-disabled="true"`.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Use `<button>` with `aria-pressed`.

## Domain value

Clients filters (All, Drafts, Confirmed, Rejected; plan) and AI Classification (To review, Approved by AI).

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
