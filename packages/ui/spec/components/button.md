# button

## Purpose

Triggers an action. One primary action per area; secondary actions use the outlined button.

## Variants

- Secondary (`.gbtn`): 30px, 1px `border.default`, `surface.panel`, 12.5px/500, optional 13px icon in its semantic color. Used for Acknowledge, Resolve, Escalate.
- With key (`.gbtn` + kbd at the end, 2px margin): ticket actions show their shortcut inside the button: "Acknowledge A", "Resolve R", "Escalate E". Only for single-key shortcuts; shortcuts with a modifier (⌘↵) go in `title`.
- Primary (`.pbtn`): 30px, `accent.default` fill, `text.onAccent`. `.sm` is 28px for popovers.
- Ghost (`.qbtn`): 28px, no border, `text.secondary`. Tertiary inline actions such as Cancel. `.qbtn.xs` is 24px with 12px text, for actions inside rows and headers ("Wrong classification?", evidence-panel row actions).
- Icon (`.ibtn`): 28×28, icon only. `.lg` is 44×44 for the public web mobile menu.
- Link (`.lnk`): `accent.ink`, 500.
- Split send (`.send`): button, divider and menu trigger on `accent.default`. The main part sends (⌘↵); the chevron opens a 220px popover aligned right and opening upward with one menu item: "Send and resolve" with kbd ⌘⇧↵. Send leaves the ticket awaiting the customer; Send and resolve resolves it.
- Split send in note mode (`.send.note`): `notes.sendAction`, lock icon + "Add note", no divider and no chevron: a note does not change the ticket status.
- Sizes: 30px default (`size.control`), 28px (`size.control-sm`), 24px (`.qbtn.xs`) and 34px (`size.control-lg`) for form footers and page toolbars.
- Web sizes: `.md` 40px / 14px, `.lg` 44px / 14.5px, `.full` takes the container width.
- Provider: `.gbtn.md.full` with the provider logo at 16px (Continue with Google, Continue with SSO).

## States

- **default**: Secondary: `surface.panel`, `border.default`, `shadow.xs`. Primary: `accent.default`.
- **hover**: Secondary: `surface.hover` and `border.strong`. Primary and each half of split send: brightness 0.93. Ghost and icon: `surface.hover` and `text.primary`. Link: underline.
- **active**: Pressed: secondary takes `surface.sunken` with `border.strong`; primary drops to brightness 0.86; ghost and icon take `border.strong` as fill. `.ibtn.on` (`surface.hover`) while its popover is open.
- **disabled**: Opacity 0.6, default cursor. Split send: 0.55, and disabled while the text is empty.
- **loading**: The icon is replaced by a spinner (on primary, white border at 35% and white top), the label stays, the button is disabled with `aria-busy="true"`.
- **error**: Buttons are not recolored on failure: the button returns to default and a 12px `color.bad-ink` message appears next to it, or a bad callout for the whole form.

## Accessibility

- Use a real `<button>` or `<a href>`.
- Icon-only buttons carry `aria-label`; buttons with a modifier shortcut carry it in `title`.
- A button with a key carries `aria-keyshortcuts` ("A", "R", "E"). The kbd inside it is `aria-hidden`, so the accessible name stays "Acknowledge".
- The split send chevron carries `aria-label` "More send options", `aria-haspopup="menu"` and `aria-expanded`.
- Web touch targets are at least 44px (`.lg`).
- Focus: 2px `border.focus` outline, 1px offset.

## Domain value

Ticket actions keep their semantic icon colors: Acknowledge in accent, Resolve in ok, Escalate in mood. The AI never presses Send; every send is triggered by the agent.

## Platforms

- **web**: Triage app in the browser and the public web. Below `layout.breakpoint`, the kbd inside app buttons is hidden; `title` and `aria-keyshortcuts` stay.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: Not designed.
