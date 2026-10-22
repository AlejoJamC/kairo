# permission-list

## Purpose

Lists what the product will do with the connected email account, as rows with a switch, before the person accepts. The same block holds the initial rules on the last wizard step.

## Variants

- Row: padding 12×16, 1px `border.default` divider between rows. Name 13.5px/500 in `text.primary` and description 12px in `text.secondary`; requirement state in mono 10.5px `text.tertiary` ("required" or "optional"); switch.
- Required row: switch on and disabled; its label is "[permission], required".
- Optional row: switch with `aria-pressed`, off by default. Drafting replies always starts off.
- Expanded: card with a header (section label and provider name in mono 10.5px `text.tertiary`, bottom border `border.default`) and every row. Used when the permissions are the main decision on the screen.
- Collapsed: for choices with a sensible default that do not need a decision before the primary action. It always sits below the primary action, never above it, and starts closed. Card with `overflow: hidden`.
  - Summary: a button, minimum height `size.web-lg`, padding 0×16, 13px in `text.secondary`. In order: 13px icon in `text.tertiary`; what it is; on the right, its state in mono 10.5px `text.tertiary`; 12px chevron pointing right that rotates 90° when open (150ms).
  - The summary reads as one sentence: "What we will ask Google for · 2 permissions · read-only".
  - Open: the summary gains a bottom border `border.default` and the rows follow, without a header.
- Collapsed, rules mode (last wizard step): the same block, not a separate variant. The icon is the settings icon; the summary is "Initial rules · N of 4 on", where N updates as switches change; rows have no requirement state and every switch can be changed (`aria-pressed`, label is the rule name).
- Icons come from the icon set: lock for permissions, settings for rules.

## States

- **default**: Collapsed and closed (`aria-expanded="false"`, rows hidden).
- **hover**: The summary takes `surface.hover` and `text.primary`.
- **active**: Open (`aria-expanded="true"`): summary border, rotated chevron and visible rows.
- **disabled**: Required switches are on and disabled. The summary is never disabled.
- **loading**: Not applicable: the content is fixed and does not wait for data.
- **error**: If the provider declines the permission for an optional switch, the switch returns to off and a callout in the error tone below the card gives the reason.

## Accessibility

- Disclosure pattern: the summary is a `<button>` with `aria-expanded` and `aria-controls` pointing to the `id` of the rows container. Enter and Space open and close it; focus stays on the button.
- When open, Tab moves to the switches that can be changed, in row order; disabled required switches are read with their label.
- Focus ring: 2px in `border.focus`, drawn inside the summary (negative offset) so `overflow: hidden` does not clip it.
- The icon and chevron are `aria-hidden`. The summary state is text, not color alone.
- Contrast: `text.secondary` on `surface.panel` and `text.tertiary` on `surface.hover` meet 4.5:1.

## Domain value

First wizard step, collapsed, lists only what is requested on connect: read messages and classify, both required. Drafting replies is not requested there.
Last wizard step, collapsed in rules mode, below the primary action: classify every incoming ticket (on), archive spam by heuristic (on), prioritize paying clients (off), draft replies (off). Turning on draft replies makes the provider ask for that permission separately, and its description says so.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px the page margin is 16px; the summary state stays on one line and the summary text truncates first.
