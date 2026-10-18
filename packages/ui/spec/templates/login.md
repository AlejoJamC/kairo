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
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px the page margin is 16px, grids collapse to one column and hide-sm elements are hidden.
