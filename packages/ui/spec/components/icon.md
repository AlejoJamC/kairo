# icon

## Purpose

Line icons of the system.

## Variants

- Inline SVG, 24 viewBox, `currentColor` stroke, round caps and joins. Stroke 1.6–1.8 in navigation, 2–2.4 at 9–13px. Sizes 12–16px; 44px only in empty states.
- Navigation: triage, awaiting, resolved, escalated, spark, knowledge, clients, settings.
- Actions: check, resolve, escalate, lock, send, zap, clip, copy, download, plus, x.
- Signals and meta: clock, msg, link, flag, info, bell, user, mail.
- Assistant: summary, draft, layers. Interface: search, sidebar, globe, moon, down, up, right, arrow.
- Spark: four-point star, filled in accent. It only means "this comes from the AI".

## States

- **default**: Inherits the text color of its container.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Decorative icons carry `aria-hidden="true"`; meaningful SVGs carry `role="img"` and `aria-label`.

## Domain value

Priority glyph, confidence ring and sentiment face are drawn as their own components, not as loose icons.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
