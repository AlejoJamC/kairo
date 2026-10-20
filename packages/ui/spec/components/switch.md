# switch

## Purpose

Turns a setting on or off with immediate effect.

## Variants

- Switch (`.switch`): 36×20, 16px knob with `shadow.knob`.

## States

- **default**: Off: `border.strong` track.
- **hover**: Off track darkens to `color.faint`; on track drops to brightness 0.93.
- **active**: On: `accent.default` track, knob moves 16px (150ms).
- **disabled**: Opacity 0.6. A required permission is on and disabled.
- **loading**: Saving: the switch is disabled (opacity 0.6) with an 11px spinner beside it.
- **error**: Save failed: the switch returns to its previous position and a 12px `color.bad-ink` message appears in the row.

## Accessibility

- `<button role="switch" aria-checked>` with `aria-label` equal to the row name; required ones read "[permission], required".

## Domain value

Triage Engine tiers, onboarding permissions (read, classify: required; draft replies: optional, off by default) and initial rules.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
