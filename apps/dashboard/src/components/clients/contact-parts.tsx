import { useTranslation } from "react-i18next";

import { type ContactRowStatus } from "@kairo/client-core/contact-row";
import { Badge, Box, Icon, Text } from "@kairo/ui";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

export function StatusBadge({ status }: { status: ContactRowStatus }) {
  const { t } = useTranslation("clients");
  const variant = status === "proposed" ? "draft" : status === "confirmed" ? "sent" : "outline";
  const labelKey =
    status === "proposed"  ? "badges.draft" :
    status === "confirmed" ? "badges.confirmed" :
                             "badges.rejected";
  return <Badge variant={variant}>{t(labelKey)}</Badge>;
}

export function ExternalSourceBadge({ source }: { source: string }) {
  return <Badge variant="outline">{source}</Badge>;
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
