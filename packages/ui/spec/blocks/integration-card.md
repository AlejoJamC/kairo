# integration-card

## Purpose

Connected or available channel in settings.

## Variants

- 84px card, padding 16px 18px, 14px gap: 40px tile (service initial on the provider color, placeholder for the provider logo), name 600, connected dot (`color.ok`), BETA tag, description 12.5/1.4 in `text.tertiary`, and an action on the right.
- Grid `repeat(auto-fit, minmax(min(360px, 100%), 1fr))`, 12px gap, under the page-header "Integrations" · "Connect the channels your support arrives through." Below the grid, the "Support channels" section with a settings-row ("Email inboxes" → "Manage").
- By integration state:
  - Connected: ok dot; action "Configure" (ghost).
  - Available: action "Connect" (secondary).
  - Beta, not requested: BETA; action "Request access" (secondary).
  - Beta, requested: BETA; action "Requested" (secondary, disabled).
  - Coming soon: no button; "COMING SOON" in `.soon`; the description says when, if known.
- No card uses a primary button: the grid has no single main action.

## States

- **default**: As described in Variants.
- **hover**: Action hover.
- **active**: Connected: ok dot. Connecting turns the card into Connected and a toast says "[Service] connected"; requesting turns it into Requested and the toast says "Access request sent".
- **disabled**: Coming soon: no action. Requested: disabled button (opacity 0.6).
- **loading**: Connecting: the action becomes a disabled secondary button with a spinner, and the status dot pulses in `color.warn`.
- **error**: Connection lost: the dot turns `color.bad`, the description is replaced by the error in `color.bad-ink`, and the action becomes Reconnect (secondary).

## Accessibility

- Action buttons name the service ("Connect Slack").
- The tile is decorative (`aria-hidden`); the ok dot carries visually hidden text "connected". BETA and COMING SOON are text.

## Domain value

Email inboxes connected to the account (support@acme.com) and upcoming channels.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint`, one column.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
