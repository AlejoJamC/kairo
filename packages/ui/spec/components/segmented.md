# segmented

## Purpose

Switches between two or three mutually exclusive modes in place, and filters a list without leaving the view.

## Variants

- Segmented (`.segc` + `.seg`): `surface.hover` track with 2px padding; 26px segments (`size.seg`), 12px/500, label alone or with a 12px icon before it.
- Note mode (`.seg.note.on`): `notes.background`, `notes.label`.
- Large (`.segc.lg`, web): 34px segments (`size.seg-lg`), for the billing period on the pricing page.
- View tabs (`.vt`): 28px list filters, padding 0 10px, 6px gap, 12.5px/500. Fixed internal order: optional glyph → label → `.cnt` count of 10.5px.
- Priority filters (`.vt` with glyph), inside queue-header with a 4px gap: All · P1 · P2 · P3. All has no glyph; P1, P2 and P3 carry their 12px priority-glyph before the label. The count is the number of open tickets with that priority; All shows the total open.
- Where it is used:
  - Triage app: Reply / Internal note in composer; Light / Dark in account-menu; All / Mentions in the activity list; priority filters in queue-header.
  - Public web: ES / EN in top-nav; Privacy / Terms on the legal pages; Monthly / Annual (large) on the pricing page; Priority / Recent in the sample queue inside product-frame on the landing page.
- Not used in the onboarding wizard: the wizard asks nothing that is chosen between modes. Step 1 is a single action, Connect Gmail, and what can be adjusted goes in permission-list, collapsed, below that action.

## States

- **default**: Inactive segments and view tabs in `text.tertiary`.
- **hover**: `text.primary`; view tabs also take `surface.hover`.
- **active**: `surface.panel` with a `border.default` ring and `shadow.xs`.
- **disabled**: Disabled segment: opacity 0.6, no hover, `aria-disabled="true"`. A priority filter with a count of 0 is not disabled: it can be chosen and shows the empty list.
- **loading**: The count shows — until there is data.
- **error**: If the count could not be computed, —; the filter still works.

## Accessibility

- Use `role="tablist"`/`tab` for composer mode; `role="group"` with `aria-pressed` for language, theme and billing period; links with `aria-current` for legal tabs.
- Priority filters: `role="tablist"` with `aria-label="Priority"`; each `.vt` is `role="tab"` with `aria-selected`. The glyph is decorative (`aria-hidden`); the label and count give the name ("P1, 3 tickets").
- Tertiary text stays at 4.5:1 or more on `surface.hover` and on `accent.soft`, so labels and metadata keep AA contrast on hover, inside the segmented track and on selected rows.

## Domain value

Reply / Internal note in the composer; Light / Dark; All / Mentions; ES / EN language; Monthly / Annual billing; priority filters of the Triage queue.

## Platforms

- **web**: Triage app in the browser and the public web. Below `layout.breakpoint` the priority filters scroll horizontally without wrapping.
- **desktop**: Triage desktop app, same component.
- **mobile**: Public web: designed, below 720px. App: Not designed.
