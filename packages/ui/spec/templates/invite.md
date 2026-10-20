# invite

## Purpose

Accept an invitation to a workspace.

## Variants

- Valid: inviter and workspace, property rows (workspace Acme, role Agent, expires), read-only email, Accept and create password, Accept with Google.
- Expired: neutral status panel with Go to sign in.

## States

- **default**: Valid invitation.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Not applicable.
- **error**: Expired invitation.

## Accessibility

- See auth-card and status-panel.

## Domain value

The invitation is bound to one email address.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px the page margin is 16px, grids collapse to one column and hide-sm elements are hidden.
