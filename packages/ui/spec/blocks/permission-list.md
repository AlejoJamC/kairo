# permission-list

## Purpose

Permissions requested from the email provider, and initial rules.

## Variants

- Card with a header (label and provider) and rows: name 13.5px/500, description, mono state (required / optional) and a switch.

## States

- **default**: Required: switch on and disabled. Optional: off by default.
- **hover**: Not applicable.
- **active**: Optional switch on.
- **disabled**: Required switches.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Switch labels include the permission name and its requirement.

## Domain value

Read messages and classify are required; drafting replies is optional and starts off.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px the page margin is 16px, grids collapse to one column and hide-sm elements are hidden.
