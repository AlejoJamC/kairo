# segmented

## Purpose

Switches between two or three mutually exclusive modes in place.

## Variants

- Segmented (`.segc` + `.seg`): `surface.hover` track with 2px padding; 26px segments.
- Note mode (`.seg.note.on`): `notes.background`, `notes.label`.
- Large (`.segc.lg`, web): 34px segments.
- View tabs (`.vt`): 28px list filters with a count, used for priority filters in the queue.

## States

- **default**: Inactive segments in `text.tertiary`.
- **hover**: `text.primary`.
- **active**: `surface.panel` with a `border.default` ring and `shadow.xs`.
- **disabled**: Disabled segment: opacity 0.6, no hover, `aria-disabled="true"`.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Use `role="tablist"`/`tab` for composer mode; `role="group"` with `aria-pressed` for language and billing period; links with `aria-current` for legal tabs.
- Tertiary text stays at 4.5:1 or more on `surface.hover` and on `accent.soft`, so labels and metadata keep AA contrast on hover, inside the segmented track and on selected rows.

## Domain value

Reply / Internal note in the composer; Light / Dark; All / Mentions; ES / EN language; Annual / Monthly billing; priority filters.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
