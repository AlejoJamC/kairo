# auth-card

## Purpose

Centered card for sign-in, invitation and password pages.

## Variants

- Layout on `surface.sidebar` with a masked grid background, 64px header and reduced footer. Column 400px (420px for invitations): title 26px/600, subtitle.
- Card: providers (Google, SSO), divider "or with email", fields with labels, forgot-password link, error callout, primary submit.
- Invitation: workspace tile with the inviter avatar, compact property rows (workspace, role, expires), read-only email.
- Submit: ↵ in any field submits the form; the primary button carries no kbd.
- Desktop (sign-in window of the desktop app): instead of the 64px header, the 44px `.auth-bar`: a drag area with the system controls slot on the left (see window-chrome) and, on the right, the language select without background or border (132px); no footer. Above the title, the brand mark at 40px with `radius.input`. Subtitle "Use your workspace account. Your queue is waiting where you left it." Under the card, instead of the sign-up link, a small note in `text.tertiary`: "The desktop app is for workspaces that are set up. Sign-up and initial setup happen on kairo.app."
- Desktop, continue in your browser: Google and SSO are confirmed in the browser. Pressing them replaces the form card with `.auth-wait` (card, padding 28px 24px, 14px gap, centered): 18px spinner with a 2px border · "Continue in your browser" 15px/600 · small text, max 300px: "We opened kairo.app so you can confirm access. When you finish, come back here: the app opens by itself." · Copy link (secondary with the copy icon; after copying it reads "Link copied") and Cancel (ghost, back to the form).

## States

- **default**: As described in Variants.
- **hover**: Button hovers.
- **active**: Field focus.
- **disabled**: Submit disabled until the form is valid (set password).
- **loading**: Submit shows a 12px white spinner with its progress label and is disabled; provider buttons are disabled and fields become read-only. Desktop: while waiting for the browser, the `.auth-wait` card.
- **error**: Error callout with `role="alert"`: email or password do not match. Desktop: if the browser does not confirm, `.auth-wait` returns to the form with the same callout and the reason.

## Accessibility

- Every field has a label; autocomplete attributes set; error announced as alert.
- `.auth-wait` is `role="status"` with `aria-live="polite"`; focus moves to Copy link.

## Domain value

Sign in, accept an invitation, create or reset a password. Example: support@acme.com at Acme.

## Platforms

- **web**: Public web (no session).
- **desktop**: Sign-in window of the desktop app, desktop variant on macOS; on Windows and Linux the same window with the native frame and no controls slot.
- **mobile**: Designed. Fluid column with 16px side padding.
