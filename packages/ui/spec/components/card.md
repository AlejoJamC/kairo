# card

## Purpose

Groups related content on a surface.

## Variants

- Card (`.card`): `border.default`, radius card, `surface.panel`, `shadow.xs`. Inner rows are separated by `border.default` top borders, never nested cards.
- Pending area: dashed `border.strong` container with bracketed placeholder text, no card.
- Form footer outside the card: top border, Discard (secondary) and Save changes (primary) at 34px, right-aligned.

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Cards are not interactive by themselves; actions inside are real buttons.

## Domain value

Settings sections, tables, KPI strips, plan cards and feature cards.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
