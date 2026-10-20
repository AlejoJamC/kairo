# window-chrome

## Purpose

Window frame of the desktop app: the space reserved for the system window controls and the areas that drag the window.

## Variants

- macOS (hidden-inset title bar): the app content reaches the top edge and macOS draws its three controls (close, minimize, full screen) on top. Kairo never paints or imitates them and has no tokens for their colors.
- Controls slot (`.win-ctrl`): 52×20px (three 12px controls with 8px gaps), top left, inside the `.win-row` of the sidebar desktop variant (`.sb.desk`: 14px from the top edge, 4px from the left). Nothing interactive may fall inside it.
- Drag areas (`.win-drag`): the top strip of every column, at the height of its first row: the `.win-row` of sidebar, the title line of queue-header, ticket-bar, the tabs row of the context panel, a 14px `.win-strip` above the page-header frame in page views (Clients, Knowledge, Settings), and the 44px `.auth-bar` of the auth-card desktop variant.
- Inside a drag area every control (`button`, `a`, `input`, `select`, `textarea`, tabs) is excluded from dragging and responds to clicks.
- Double click on a drag area does what the system is set to do (zoom or minimize).
- Full screen: the system hides the controls; the slot stays so the layout does not shift.
- Windows and Linux: the native system frame with its standard title bar; no controls slot and no drag areas of its own: the app starts below the system bar.

## States

- **default**: Active window: the controls in their system colors.
- **hover**: Drawn by the system.
- **active**: Dragging from a drag area moves the window; content is not selected.
- **disabled**: Inactive window: the system greys out the controls; Kairo changes nothing in the content.
- **loading**: Not applicable.
- **error**: Not applicable.

## Accessibility

- Drag areas are not controls: no role and not in the tab order.
- The controls slot is `aria-hidden`; the controls belong to the system, which exposes them to screen readers.
- Minimize, zoom and close are also in app-menu › Window, with their system keys.

## Domain value

The Acme Support agent moves the Kairo window by grabbing the top of any column, as with any native app, without a separate title bar taking vertical space from the queue.

## Platforms

- **web**: Not applicable: the browser provides its own frame.
- **desktop**: macOS as described; Windows and Linux with the native frame.
- **mobile**: Not designed.
