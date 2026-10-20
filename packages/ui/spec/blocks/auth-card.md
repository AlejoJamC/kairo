# auth-card

## Purpose

Centered card for sign-in, invitation and password pages.

## Variants

- Layout on `surface.sidebar` with a masked grid background, 64px header and reduced footer. Column 400px (420px for invitations): title 26px/600, subtitle.
- Card: providers (Google, SSO), divider "or with email", fields with labels, forgot-password link, error callout, primary submit.
- Invitation: workspace tile with the inviter avatar, compact property rows (workspace, role, expires), read-only email.

## States

- **default**: As described in Variants.
- **hover**: Button hovers.
- **active**: Field focus.
- **disabled**: Submit disabled until the form is valid (set password).
- **loading**: Submit shows a 12px white spinner with its progress label and is disabled; provider buttons are disabled and fields become read-only.
- **error**: Error callout with `role="alert"`: email or password do not match.

## Accessibility

- Every field has a label; autocomplete attributes set; error announced as alert.

## Domain value

Sign in, accept an invitation, create or reset a password. Example: support@acme.com at Acme.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Fluid column with 16px side padding.
