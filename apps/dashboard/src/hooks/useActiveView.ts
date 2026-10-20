import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import type { AppView } from "@/types";
import { pathForView, viewForPath } from "@/routes";

/**
 * The view the URL points at and a setter that navigates to another view.
 * An unknown path reads as null so the shell can redirect it.
 */
export function useActiveView(): [AppView | null, (view: AppView) => void] {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const setView = useCallback((view: AppView) => navigate(pathForView(view)), [navigate]);
  return [viewForPath(pathname), setView];
}
