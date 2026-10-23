# chip

## Purpose

Compact label for a value, a filter or a selection.

## Variants

- Static: 24px, pill, `border.default`, 12px `text.secondary` on `surface.panel`.
- Interactive (`button.chip`, `a.chip`): opens a menu or toggles.
- Removable: 30px, radius field, 18px remove button.
- Key–value: 26px, key in `text.tertiary`, value in `text.primary` 500.
- Large (`.lg`, web): 30px, 12.5px. Used for the channel strip (dot in `color.ok` with "available" in `color.ok-ink`, or dot in `border.strong` with "coming soon" in `text.tertiary`) and the hero announcement.
- Categories always use category-chip (24px), on the public web too; never the large chip.

## States

- **default**: As described in Variants.
- **hover**: `border.strong` and `text.primary`.
- **active**: Selected (`.on`): `accent.soft`, `accent.line` border, `accent.ink` text.
- **disabled**: Opacity 0.6, no hover.
- **loading**: Skeleton chip: a 24px pill `.shim`, 60px wide.
- **error**: Invalid value (for example a duplicate custom category): `color.bad` border and `color.bad-ink` text.

## Accessibility

- Remove buttons carry `aria-label="Remove"`.
- Selection is not conveyed by color alone: selected chips also change border and text.

## Domain value

Chips carry plan, role, ticket type and category, and the key–value fields of an AI proposal.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
