# badge

## Purpose

Small status or count marker. The badge family.

## Variants

- Count (`.badge`): 16px pill, `accent.default`, mono 10px/600. The notification bell uses 15px on `bad`.
- Team only (`.team`): mono 9.5px/500 uppercase on `notes.background` with a lock icon.
- AI (`.aibadge`): mono 9.5px/500 uppercase on `accent.soft` in `accent.ink` with the spark (DRAFT, NEW).
- Draft client (`.tag.draft`): lowercase on `notes.background`.
- Outline (`.tag.outline`), sent reply (`.tag.sent`), beta (`.tag.beta`).
- Mentioned you: 16px, `accent.default` solid, mono 9px/600.
- Escalated: 20px pill in `status.escalated` with a 35% ring and arrow.

## States

- **default**: As described in Variants.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Counts are announced with their label; badges are never the only cue for a state.

## Domain value

Internal is amber (notes scale), AI is accent, escalation is mood. Nothing amber is ever sent to the customer.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Mobile companion app: same badge family and tokens. The count badge grows to 18px with mono 11px; team, AI and draft badges appear only inside rows and are never tap targets.
