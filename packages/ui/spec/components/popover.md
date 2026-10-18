# popover

## Purpose

Floating surface for menus and small dialogs.

## Variants

- Popover (`.pop`): `surface.panel`, `border.default`, radius card, `shadow.pop`, absolutely positioned.
- Used for status and priority menus, Correct classification, account, mentions and activity.

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Open.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- `role="menu"` or `role="dialog"` with `aria-label`; closes with esc and outside click.

## Domain value

Classification correction lets the agent fix the AI; every correction teaches Triage.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
