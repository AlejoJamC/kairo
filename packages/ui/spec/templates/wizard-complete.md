# wizard-complete

## Purpose

Onboarding step 3: the queue is ready; open it.

## Variants

- Header: top-nav wizard header with the stepper on step 3 of 3 (Connect and Detect completed). No Exit: there is nothing left to leave.
- Main column, 480px max, centered, 28px gap, top to bottom:
  - Mono eyebrow "Step 3 of 3", title "Your Triage is ready.", body text with the ticket total and the urgent count, and that the product learns from every confirmation and correction.
  - Open Triage: primary button, large, with an arrow icon. It is the only action.
  - permission-list, collapsed and closed, in rules mode, below the button: settings icon, summary "Initial rules · N of 4 on". Open, four rules with switches that can be changed.
- Summary aside, 600px max, on `surface.sidebar` with a left border `border.default`:
  - "First in your queue": product-frame without the top bar holding the first three compact ticket-row items of the queue, in queue order.
  - "Shortcuts to start": large kbd keys with their verbs: J K navigate, A acknowledge, ⌘K commands.
- There are no counts in the aside and no secondary action.

## States

- **default**: Rules summary closed, 2 of 4 on.
- **hover**: As in button and permission-list.
- **active**: Rules summary open; a rule switch toggled updates N in the summary.
- **disabled**: Not applicable.
- **loading**: Not applicable: the queue is ready when this step opens.
- **error**: Turning on draft replies and declining the provider permission returns that switch to off, with an error callout below the card.

## Accessibility

- One `<h1>`: the step title. The stepper marks this step with `aria-current="step"` and the other two as done.
- Rules summary: disclosure button with `aria-expanded` and `aria-controls`; each switch uses `aria-pressed` and the rule name as its label.
- The summary aside has `aria-label="Summary"`; the row list has its own label.

## Domain value

Initial rules: classify every incoming ticket (on), archive spam by heuristic (on), prioritize paying clients (off), draft replies (off; the provider asks for that permission separately). Nothing runs on its own beyond these rules; the product learns from what the person confirms or corrects.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 980px the summary aside is hidden; below 720px the page margin is 16px and stepper labels are hidden visually.
