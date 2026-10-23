# choice-card

## Purpose

Selects one option among two or more available options of equal weight, each with a name, an icon and an availability state.

## Variants

- Button of 88px minimum height, padding 14px, radius input, in a three-column grid; 20px icon (stroke 1.7), name, availability in mono.
- Where it is used: no screen in the public web or the app uses it. It is kept for a choice between two or more available options, for example several connectable email providers.
- Not used in the onboarding wizard: step 1 has a single available channel, connected with a primary button; channels that are not available go in a mono note below it. Not used on the landing page either: its channel strip is chip items, not a choice.

## States

- **default**: Available, not selected: `surface.panel` with a `border.default` border, name 500 in `text.primary`.
- **hover**: Available, not selected: `border.strong` border and `surface.hover` fill.
- **active**: Selected: `accent.soft` with `accent.line` inset, icon and check in `accent.ink`, name 600, "available" in mono `color.ok-ink`.
- **disabled**: Coming soon: dashed `border.strong`, icon and text in `text.tertiary`, name 500 in `text.secondary`, "coming soon" in mono.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- `<button aria-pressed>` inside a `<fieldset>` with a `<legend>` naming the choice.
- The check icon is `aria-hidden`; the selected state comes from `aria-pressed`, not color alone.

## Domain value

Options that can be connected or chosen, each marked available or coming soon.

## Platforms

- **web**: Public web (no session). Not placed on any screen.
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px the grid collapses to one column.
