import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@kairo/ui";

/**
 * Contractual SLA of a ticket (from its plan tier): remaining time, or
 * "breached" once the due date has passed or the API flags it. Not the
 * operational SLA by ticket priority, which has its own badge.
 */
export function SlaBadge({ slaDate, breached = false }: { slaDate: string | null | undefined; breached?: boolean }) {
  const { t } = useTranslation("dashboard");

  const label = useMemo(() => {
    if (breached) return { text: t("ticketCard.slaBreached"), breached: true };
    if (!slaDate) return null;
    const diff = new Date(slaDate).getTime() - Date.now();
    if (diff <= 0) return { text: t("ticketCard.slaBreached"), breached: true };

    const totalMinutes = Math.floor(diff / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0
      ? { text: t("ticketCard.slaHours_other", { count: hours, minutes }), breached: false }
      : { text: t("ticketCard.slaMinutes_other", { count: totalMinutes }), breached: false };
  }, [slaDate, breached, t]);

  if (!label) return null;

  return (
    <Text
      title={t("ticketCard.slaTooltip", "SLA contractual según el plan del cliente")}
      fontSize={10}
      fontWeight={600}
      paddingVertical={2}
      paddingHorizontal={6}
      borderRadius={4}
      backgroundColor={label.breached ? "var(--kairo-color-bad-soft)" : "var(--kairo-color-hover)"}
      color={label.breached ? "var(--kairo-color-bad-ink)" : "var(--kairo-color-faint)"}
      textTransform={label.breached ? "uppercase" : undefined}
      letterSpacing={label.breached ? 0.3 : undefined}
      whiteSpace="nowrap"
      flexShrink={0}
    >
      {label.text}
    </Text>
  );
}
