import { useTranslation } from "react-i18next";

import { type ContactRowStatus } from "@kairo/client-core/contact-row";
import { Box, Icon, Text } from "@kairo/ui";
import { BADGE_STYLE } from "@/components/clients/contact-helpers";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

export function StatusBadge({ status }: { status: ContactRowStatus }) {
  const { t } = useTranslation("clients");
  const s = BADGE_STYLE[status];
  const labelKey =
    status === "proposed"  ? "badges.draft" :
    status === "confirmed" ? "badges.confirmed" :
                             "badges.rejected";
  return (
    <Text fontSize={10} fontWeight={600} paddingVertical={2} paddingHorizontal={7} borderRadius={999} backgroundColor={s.bg} color={s.color} borderWidth={1} borderColor={s.border} letterSpacing={0.3} flexShrink={0} borderStyle="solid">
      {t(labelKey)}
    </Text>
  );
}

export function ExternalSourceBadge({ source }: { source: string }) {
  const s = BADGE_STYLE.external;
  return (
    <Text fontSize={10} fontWeight={600} paddingVertical={2} paddingHorizontal={7} borderRadius={999} backgroundColor={s.bg} color={s.color} borderWidth={1} borderColor={s.border} letterSpacing={0.3} flexShrink={0} borderStyle="solid">
      {source}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// CSAT cell
// ---------------------------------------------------------------------------

export function CsatCell({ value }: { value: number | null }) {
  if (value == null) return <Text color="var(--k-text-tertiary)" font="mono">—</Text>;
  const color = value >= 4.7 ? "var(--kairo-color-ok)" : value >= 4.0 ? "var(--kairo-color-warn)" : "var(--kairo-color-bad)";
  const face = value >= 4.7 ? "face-add" : value >= 4.0 ? "face-neutral" : "face-frown";
  return (
    <Box display="flex" alignItems="center" gap={5}>
      <Icon name={face} size={14} color={color} />
      <Text font="mono" fontSize={13}>{value}</Text>
    </Box>
  );
}
