# window-chrome

## Purpose

Window frame of the desktop app: the corner reserved for the system window controls and the areas that drag the window.

## Variants

- macOS (hidden-inset title bar): the app content reaches the top edge and macOS draws its three controls (close, minimize, full screen) on top. Kairo never paints or imitates them and has no tokens for their colors.
- Reserved corner: 80×44px at the top left. Nothing interactive may fall inside it.
  - Controls slot (`.win-ctrl`): 52×20px (three 12px controls with 8px gaps), 12px from the top edge and 14px from the left, centered in the 44px `.win-row` of the sidebar desktop variant.
  - Sidebar expanded: the controls live in that row, left of the brand; the brand starts after the reserved corner.
  - Sidebar collapsed: the controls (14 + 52px) pass the 60px rail by about 6px, and the system does not let them move. The 44px row is 60px wide and takes the background of the neighboring column (`surface.panel` when the ticket list or the settings navigation is next to it; `surface.page` when the ticket is), so the controls sit on one continuous strip and never cross a line. The sidebar border starts below the row (`.sb-edge`, from 44px).
  - Neighboring column: its content starts 80px or more from the window edge (queue: 60 + 20px; ticket: 60 + 24px), so it never enters the corner.
- Drag areas (`.win-drag`): the top strip of every column, at the height of its first row: the 44px `.win-row` of sidebar, the title line of queue-header, ticket-bar, the tabs row of the context panel, a 14px `.win-strip` above the page-header frame in page views (Clients, Knowledge, Settings), and the 44px `.auth-bar` of the auth-card desktop variant.
- Inside a drag area every control (`button`, `a`, `input`, `select`, `textarea`, tabs) is excluded from dragging and responds to clicks.
- Double click on a drag area does what the system is set to do (zoom or minimize).
- Full screen: the system hides the controls; the 80×44 corner stays so the layout does not shift.
- Windows and Linux: the native system frame with its standard title bar; no reserved corner and no drag areas of its own: the app starts below the system bar.

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
