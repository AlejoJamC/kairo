# button

## Purpose

Triggers an action. One primary action per area; secondary actions use the outlined button.

## Variants

- Secondary (`.gbtn`): 30px, 1px `border.default`, `surface.panel`, 12.5px/500, optional 13px icon in its semantic color. Used for Acknowledge, Resolve, Escalate.
- Primary (`.pbtn`): 30px, `accent.default` fill, `text.onAccent`. `.sm` is 28px for popovers.
- Ghost (`.qbtn`): 28px, no border, `text.secondary`. Tertiary inline actions such as Cancel.
- Icon (`.ibtn`): 28×28, icon only. `.lg` is 44×44 for the public web mobile menu.
- Link (`.lnk`): `accent.ink`, 500.
- Split send (`.send`): button, divider and menu trigger on `accent.default`; `.note` uses `notes.sendAction`.
- Web sizes: `.md` 40px / 14px, `.lg` 44px / 14.5px, `.full` takes the container width.
- Provider: `.gbtn.md.full` with the provider logo at 16px (Continue with Google, Continue with SSO).

## States

- **default**: Secondary: `surface.panel`, `border.default`, `shadow.xs`. Primary: `accent.default`.
- **hover**: Secondary: `surface.hover` and `border.strong`. Primary: brightness 0.93. Ghost and icon: `surface.hover` and `text.primary`.
- **active**: Pressed: secondary takes `surface.sunken` with `border.strong`; primary drops to brightness 0.86; ghost and icon take `border.strong` as fill.
- **disabled**: Opacity 0.6, default cursor. Split send: 0.55.
- **loading**: Primary web button: disabled with a 12px spinner (white border at 35%, white top) and a progress label.
- **error**: Buttons are not recolored on failure: the button returns to default and a 12px `color.bad-ink` message appears next to it, or a bad callout for the whole form.

## Accessibility

- Use a real `<button>` or `<a href>`.
- Icon-only buttons carry `aria-label`; buttons with a shortcut carry it in `title`.
- Web touch targets are at least 44px (`.lg`).
- Focus: 2px `border.focus` outline, 1px offset.

## Domain value

Ticket actions keep their semantic icon colors: Acknowledge in accent, Resolve in ok, Escalate in mood. The AI never presses Send; every send is triggered by the agent.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
