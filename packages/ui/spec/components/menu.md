# menu

## Purpose

List of options inside a popover.

## Variants

- Menu item (`.mi`): min 32px (36–40px with an avatar), 10px gap, 13px `text.secondary`.
- Sections with a `label` header and `border.default` dividers.
- Destructive item last, in `color.bad-ink`.

## States

- **default**: As described in Variants.
- **hover**: `surface.hover`, `text.primary`; `.hl` for the keyboard-highlighted item.
- **active**: Current option `.on`: `text.primary` 500.
- **disabled**: Unavailable item: `text.tertiary` at opacity 0.6, no hover, `aria-disabled="true"`.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- `role="menuitem"`; shortcut keys shown with Kbd on the right.
- Tertiary text stays at 4.5:1 or more on `surface.hover` and on `accent.soft`, so labels and metadata keep AA contrast on hover, inside the segmented track and on selected rows.

## Domain value

Status, priority, presence and account menus; command palette results.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
