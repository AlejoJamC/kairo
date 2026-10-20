# settings-row

## Purpose

One setting inside a Settings card: what it is, what it does and its control.

## Variants

- Row (`.setrow`): padding 18px 20px, 14px gap, `border.default` divider between consecutive rows, inside a card. Optional 18px icon in `text.tertiary` (stroke 1.6) · text (`.txt`, flex 1, min 200px, 3px gap): title 500 in `text.primary` + description 12.5/1.45 in `text.tertiary` · control on the right.
- Select (field, auto width): Workspace › "Default workspace language" · "Affects classification, drafts and the knowledge base." · Español (LATAM) / English (US), with the globe icon.
- Secondary button: Security › "Password" · "No password — access by magic link only." · "Set password".
- Link `.lnk` with an arrow: Integrations › "Email inboxes" · "Email channels connected to this account." · "Manage →".
- Coming soon (`.soon`, mono 10px uppercase `text.tertiary`): Security › "Two-factor authentication" · "Extra security with a TOTP app."
- Switch: tier rows of the Triage Engine (see switch).
- Group headings outside the card: 15px/600 in `typography.section-title` ("Support channels") or the `label` style ("ACTIVE TIERS", "CUSTOM CATEGORIES"), with a 6–8px top margin.

## States

- **default**: As described in Variants.
- **hover**: Only the control.
- **active**: The control in focus; a change stays pending until Save changes (see page-header).
- **disabled**: The control at opacity 0.6; the description says why ("Only an Owner can change this.").
- **loading**: The control shows a `.shim` bar of 30×120px until the value arrives.
- **error**: Under the text, the error in 12px `color.bad-ink` ("This setting could not be loaded.").

## Accessibility

- The title labels the control (`<label for>` or `aria-labelledby`); the description goes in `aria-describedby`.
- "Coming soon" is text, not a disabled button: it is not in the tab order.

## Domain value

The Owner of the Acme workspace sets the default language that classification and drafts use, and sees which security options exist.

## Platforms

- **web**: Triage app in the browser. Below `layout.breakpoint` the control wraps under the text and aligns left.
- **desktop**: Triage desktop app, same component.
- **mobile**: Not designed.
