# login

## Purpose

Sign in.

## Variants

- Auth card with Google and SSO providers, email and password, forgot-password link, Sign in, link to start free.

## States

- **default**: Empty form.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Not applicable.
- **loading**: Auth card loading state while signing in.
- **error**: Error callout: the email or password do not match.

## Accessibility

- See auth-card.

## Domain value

Work email, for example support@acme.com.

## Platforms

- **web**: Public web (no session).
- **desktop**: Sign-in window of the desktop app: auth-card desktop variant, with the continue-in-your-browser state for Google and SSO and no link to start free.
- **mobile**: Designed. Below 720px the page margin is 16px, grids collapse to one column and hide-sm elements are hidden.
