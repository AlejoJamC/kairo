import type { AppView } from "@/types";

/** The URL path of every dashboard view. The router basename is added in front. */
export const VIEW_PATHS: Record<AppView, string> = {
  triage: "/",
  "in-progress": "/in-progress",
  awaiting: "/awaiting",
  resolved: "/resolved",
  escalated: "/escalated",
  "ai-review": "/ai-review",
  knowledge: "/knowledge",
  clients: "/clients",
  settings: "/settings",
  channels: "/settings/channels",
  "change-password": "/settings/password",
};

export function pathForView(view: AppView): string {
  return VIEW_PATHS[view];
}

const BY_PATH = new Map(Object.entries(VIEW_PATHS).map(([view, path]) => [path, view as AppView]));

/** The view for a path, or null when no view lives there. A trailing slash is ignored. */
export function viewForPath(pathname: string): AppView | null {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return BY_PATH.get(normalized) ?? null;
}
