# dock-badge

## Purpose

Counter on the desktop app icon: the same number as the bell count of the sidebar, unread notifications plus mentions.

## Variants

- The system draws the counter; Kairo only passes the number. No extra text and no colors of its own.
- Zero: no counter. 1 to 99: the number. 100 or more: "99+".
- macOS: Dock counter, in the system red.
- Windows: 16px overlay icon on the taskbar: circle in `color.bad` with the number in `text.onAccent`, mono 9px/600 (the shape of the bell count); above 9, only the circle, and the full number in the icon description.
- Linux: launcher counter where the desktop supports it; otherwise nothing.

## States

- **default**: The current number.
- **hover**: Not applicable.
- **active**: Not applicable: clicking the icon brings the window to the front, as with any app.
- **disabled**: With Away or Invisible in account-menu the counter stays (unread items do not change) but it never bounces or asks for attention.
- **loading**: No counter until there is data.
- **error**: If the count fails, no counter, as in the bell.

## Accessibility

- The system announces it with the app name; on Windows the icon description reads "Kairo, N unread".
- It never replaces the bell: the same number is always inside the app.

## Domain value

The Acme Support agent sees three unread items on the Kairo icon without switching windows.

## Platforms

- **web**: Not applicable: the browser uses the bell.
- **desktop**: macOS, Windows and Linux, as described in Variants.
- **mobile**: Not designed.
