# wizard-connect

## Purpose

Onboarding step 1: connect the support inbox with one action.

## Variants

- Header: top-nav wizard header (60px, bottom border `border.default`): brand, stepper on step 1 of 3, Exit (ghost button).
- Main column, 480px max, centered, 28px gap, top to bottom:
  - Mono eyebrow "Step 1 of 3", step title in the d3 display style, body text.
  - Connect Gmail: primary button, large (`size.web-lg`), with a 16px mail icon, aligned to the start. Below it, small text in `text.tertiary`: read-only, nothing is changed or deleted, and the account can be disconnected at any time.
  - permission-list, collapsed and closed, below the button: lock icon, summary "What we will ask Google for · 2 permissions · read-only". Open, it lists the two required permissions.
  - Mono 10.5px note in `text.tertiary` naming the channels that are coming soon.
- Preview aside, 600px max, on `surface.sidebar` with a left border `border.default` and the grid background: section label "Your inbox will look like this", product-frame without the top bar holding three compact ticket-row items (P1, P2, P3), and a mono caption saying it is an example.
- There is no channel choice and no intent choice on this step: choice-card and segmented are not used.

## States

- **default**: Nothing connected; the permission summary is closed.
- **hover**: As in button and permission-list.
- **active**: Permission summary open.
- **disabled**: Not applicable: the only action is always available.
- **loading**: After Connect Gmail the provider consent screen opens; the page does not show its own loading state.
- **error**: The person declines on the provider screen: an error callout above the button explains that the inbox was not connected and that Connect Gmail tries again.

## Accessibility

- One `<h1>`: the step title. The stepper marks this step with `aria-current="step"`.
- The permission summary is a disclosure button with `aria-expanded` and `aria-controls`; see permission-list.
- The preview aside has `aria-label="Preview"`; its rows read as text; see ticket-row.

## Domain value

The inbox is connected read-only. Classifying happens inside the product; the mailbox itself is never modified. Drafting replies is not requested on this step.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 980px the preview aside is hidden; below 720px the page margin is 16px and stepper labels are hidden visually.
