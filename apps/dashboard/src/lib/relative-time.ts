// "just now", "12m", "3h", "2d": the age shown on ticket rows and in the queue switcher.

import type { TFunction } from "i18next";

export function formatRelativeTime(iso: string | null | undefined, t: TFunction): string {
  if (!iso) return "";
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);

  if (diffMin < 1) return t("ticketCard.timeJustNow");
  if (diffMin < 60) return t("ticketCard.timeMinutes_other", { count: diffMin });

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return t("ticketCard.timeHours_other", { count: diffH });

  return t("ticketCard.timeDays_other", { count: Math.floor(diffH / 24) });
}
