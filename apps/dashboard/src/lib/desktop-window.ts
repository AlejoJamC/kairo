// Size of the desktop window: the narrowest the dashboard can be without
// clipping a column. Sidebar, ticket list, the center column and the context
// panel sit side by side; collapsing the sidebar frees its width.

import { tokens } from "@kairo/tokens";
import { CENTER_PANEL_MIN_WIDTH } from "@/components/ticket-detail";

const px = (value: string | number): number => Number.parseFloat(String(value));

export const APP_WINDOW_HEIGHT = 860;
export const APP_WINDOW_MIN_HEIGHT = 700;

/** Smallest window width the columns and the sidebar fit in; a hidden ticket list gives its width back. */
export function appWindowMinWidth(sidebarCollapsed: boolean, ticketListHidden = false): number {
  const sidebar = px(tokens[sidebarCollapsed ? "layout.sidebar-collapsed" : "layout.sidebar"]);
  const queue = ticketListHidden ? 0 : px(tokens["layout.queue"]);
  return sidebar + queue + CENTER_PANEL_MIN_WIDTH + px(tokens["layout.context"]);
}

/** The window the app opens in: wide enough for every column with the sidebar open, with some room for the center. */
export function appWindowWidth(): number {
  return appWindowMinWidth(false) + 32;
}
