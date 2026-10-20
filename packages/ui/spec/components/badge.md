# badge

## Purpose

Small status or count marker. The badge family.

## Variants

- Count (`.badge`): 16px pill, `accent.default`, mono 10px/600. The notification bell uses 15px on `color.bad` (`.bell-count`, see sidebar).
- Team only (`.team`): mono 9.5px/500 uppercase on `notes.background` with a lock icon. As a button (`button.team`, `size.chip`, 10.5px) for "+ NEW NOTE" in note-card and "1 NOTE" in ticket-bar.
- AI (`.aibadge`): mono 9.5px/500 uppercase on `accent.soft` in `accent.ink` with the spark (DRAFT, NEW).
- Draft client (`.tag.draft`): "draft" in lowercase, mono 10.5px, `notes.label` on `notes.background` with `notes.border` inset.
- Outline (`.tag.outline`), sent reply (`.tag.sent`), beta (`.tag.beta`).
- Mentioned you: 16px, `accent.default` solid, mono 9px/600.
- Escalated (`.esc`): 20px pill, mono 9.5px/500 uppercase, text and 9px arrow in `escalation.text`, 1px inset ring in `escalation.border`, no fill: "ESCALATED".

## States

- **default**: As described in Variants.
- **hover**: `button.team` only: the ring takes `notes.label`.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Counts are not shown until there is data.
- **error**: Without a count, the count badge is not shown.

## Accessibility

- Counts are announced with their label ("3 unread"); badges are never the only cue for a state.
- 9px icons are decorative; the badge text says what it marks.
- Contrast: `escalation.text` 5.18:1 on `surface.panel` and 4.63:1 on `surface.hover`; `notes.label` on `notes.background` 4.84:1; `accent.ink` on `accent.soft` 4.64:1.

## Domain value

Internal is amber (notes scale), AI is accent, escalation is mood. Nothing amber is ever sent to the customer.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Mobile companion app: same badge family and tokens. The count badge grows to 18px with mono 11px; team, AI, draft and escalated badges appear only inside rows and are never tap targets.
