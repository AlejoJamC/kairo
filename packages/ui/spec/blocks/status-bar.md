# status-bar

## Purpose

Fixed bar at the bottom of the app.

## Variants

- 28px on `surface.sidebar`: shortcuts of the current view on the left (Kbd + verb), engine status in mono with an ok pulse on the right.

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Pulse dot.
- **error**: Engine offline: the status dot turns `color.bad` without pulse and the status text is shown in `color.bad-ink`.

## Accessibility

- Shortcuts are informative text.

## Domain value

Shows open tickets and the shortcuts of queue views.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Hidden below 980px.
