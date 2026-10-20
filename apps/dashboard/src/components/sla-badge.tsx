import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { SlaIndicator } from "@kairo/ui";

/**
 * Contractual SLA of a ticket (from its plan tier): remaining time, or
 * "breached" once the due date has passed or the API flags it. Not the
 * operational SLA by ticket priority, which has its own badge.
 */
export function SlaBadge({ slaDate, breached = false }: { slaDate: string | null | undefined; breached?: boolean }) {
  const { t } = useTranslation("dashboard");

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const label = useMemo(() => {
    if (breached) return { text: t("ticketCard.slaBreached"), breached: true };
    if (!slaDate) return null;
    const diff = new Date(slaDate).getTime() - now;
    if (diff <= 0) return { text: t("ticketCard.slaBreached"), breached: true };

    const totalMinutes = Math.floor(diff / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0
      ? { text: t("ticketCard.slaHours_other", { count: hours, minutes }), breached: false }
      : { text: t("ticketCard.slaMinutes_other", { count: totalMinutes }), breached: false };
  }, [slaDate, breached, now, t]);

  if (!label) return null;

  return (
    <SlaIndicator
      variant="compact"
      status={label.breached ? "overdue" : "onTime"}
      time={label.text}
      title={t("ticketCard.slaTooltip", "SLA contractual según el plan del cliente")}
    />
  );
}
