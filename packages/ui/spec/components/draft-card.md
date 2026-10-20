# draft-card

## Purpose

AI-generated reply draft. The AI never sends.

## Variants

- Assistant: header on `surface.sunken` with the DRAFT AI badge and "Re: [subject]"; body 12.5/1.6, max 180px, scrolls; footer with Copy (secondary, 28px) and Insert into reply (primary sm).
- Web: header with the DRAFT badge, source and confidence in mono ok-ink; body 13.5/1.6; footer on `surface.sunken` with Regenerate (ghost), Edit (secondary) and Send and resolve (primary).

## States

- **default**: Appears when the answer finishes, with a fade.
- **hover**: Button hovers.
- **active**: Inserted: the button becomes primary done (`color.ok-solid`) with a check and "Inserted".
- **disabled**: On read-only tickets, Insert into reply is disabled (opacity 0.6) with the title "Ticket is read only".
- **loading**: Regenerating: the body is replaced by three skeleton bars, actions are disabled and Regenerate shows a spinner.
- **error**: Draft failed: the body is replaced by a bad callout with Retry; Copy and Insert are hidden.

## Accessibility

- Body keeps line breaks; copy confirms with a toast.

## Domain value

Insert fills the composer in Reply mode; the agent edits and sends.

## Platforms

- **web**: Triage app in the browser and the public web.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: not designed; below 980px the panes stack.
