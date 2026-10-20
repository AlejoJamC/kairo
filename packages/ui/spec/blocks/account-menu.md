# account-menu

## Purpose

Account popover: presence, appearance and session actions.

## Variants

- 270px popover that opens upward from the account button of the sidebar (58px above the bottom edge, 10px from the left). Sections separated by `border.default` dividers.
- Header (padding 12px 14px): 32px avatar · workspace name 600 with ellipsis · current presence 12px in `text.tertiary` ("Online").
- Status (padding 8px 6px): `label` header "STATUS" and three menu items with an 8px dot: Online `color.ok`, Away `color.warn`, Invisible `color.p3`; the current one `.on`.
- Appearance (padding 10px 12px, 8px gap): `label` header "APPEARANCE" and a full-width segmented Light / Dark with equal segments.
- Actions (padding 6px): Settings with kbd ⌘, · Keyboard shortcuts with kbd ? (opens shortcuts-dialog) · Sign out in `color.bad-ink`, always last.
- With the sidebar collapsed the menu anchors to the avatar in the same way.

## States

- **default**: Closed; the account button without `.on`.
- **hover**: Menu items take `surface.hover` with `text.primary`; Sign out keeps `color.bad-ink`.
- **active**: Open; the account button carries `.on`. The chosen presence and theme carry `.on`.
- **disabled**: Not applicable.
- **loading**: Changing presence updates the avatar dot at once; if the server does not confirm, it returns to the previous value.
- **error**: If the presence change fails, a toast says so and the presence returns to the previous value.

## Accessibility

- `role="dialog"` with `aria-label="Account"`. On open, focus goes to the current presence; esc or an outside click closes it and returns focus to the account button.
- Presence is a `role="radiogroup"` with `aria-label="Status"`; each item is `role="radio"` with `aria-checked`. The dot always has its label next to it.
- Appearance uses `aria-pressed`. The shortcuts ⌘, and ? work without opening the menu.

## Domain value

The agent of Acme Support marks themselves Away during a break and switches to the dark theme without leaving the queue.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint`, 270px or the available width minus 20px.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
