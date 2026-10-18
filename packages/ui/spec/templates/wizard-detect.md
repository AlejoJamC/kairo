# wizard-detect

## Purpose

Onboarding step 2: scan and classify the inbox.

## Variants

- Progress bar, KPI strip (emails read, tickets created, customers), detected categories, recently classified rows, Continue.

## States

- **default**: Scan complete.
- **hover**: Not applicable.
- **active**: Not applicable.
- **disabled**: Continue disabled while classifying.
- **loading**: Classifying: progress and pulsing status, disabled CTA with spinner.
- **error**: Progress bar error state with Retry; counts keep the last values.

## Accessibility

- Progress bar semantics and a polite live region.

## Domain value

Range of the scan shown under the CTA.

## Platforms

- **web**: Public web (no session).
- **desktop**: Not part of the desktop app design.
- **mobile**: Designed. Below 720px the page margin is 16px, grids collapse to one column and hide-sm elements are hidden.
