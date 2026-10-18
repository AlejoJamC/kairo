# integration-card

## Purpose

Connected or available channel in settings.

## Variants

- 84px card with a 40px tile (service initial on the provider color, placeholder for the provider logo), name 600, connected dot, BETA tag, description and an action or "Coming soon".

## States

- **default**: As described in Variants.
- **hover**: Action hover.
- **active**: Connected: ok dot.
- **disabled**: Coming soon: no action.
- **loading**: Connecting: the action becomes a disabled secondary button with a spinner, and the status dot pulses in `color.warn`.
- **error**: Connection lost: the dot turns `color.bad`, the description is replaced by the error in `color.bad-ink`, and the action becomes Reconnect (primary).

## Accessibility

- Action buttons name the service.

## Domain value

Email inboxes connected to the account and upcoming channels.

## Platforms

- **web**: Triage app in the browser.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed. Below 980px the app panes stack to full width.
