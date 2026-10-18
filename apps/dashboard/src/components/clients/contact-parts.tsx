import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type ContactRow, type ContactRowStatus } from "@kairo/client-core/contact-row";
import type { Client, PlanType, SlaLevel, ContactPerson } from "@/types";
import { Avatar, Box, Icon, Pressable, Spinner, Text, type KpiItem } from "@kairo/ui";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const PLAN_DOT: Record<string, string> = {
  Enterprise: "var(--kairo-color-accent)",
  Pro:        "var(--kairo-color-accent)",
  Starter:    "var(--kairo-color-faint)",
};

export const PLAN_LABEL: Record<string, string> = {
  Enterprise: "Enterprise",
  Pro:        "Pro",
  Starter:    "Starter",
};

export function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function mapRow(row: Record<string, unknown>): Client {
  return {
    id:              row.id as string,
    internalId:      row.internal_id as string,
    legalId:         (row.legal_id as string | null) ?? null,
    name:            row.name as string,
    telephone:       (row.telephone as string | null) ?? null,
    authorizedEmails: (row.authorized_emails as string[]) ?? [],
    contactPersons:  (row.contact_persons as ContactPerson[]) ?? [],
    plan:            (row.plan_type as PlanType | null) ?? null,
    slaLevel:        (row.sla_level as SlaLevel | null) ?? null,
    ticketCount:     (row.ticketCount as number) ?? 0,
    csatAvg:         (row.csatAvg as number | null) ?? null,
    lastContactAt:   (row.lastContactAt as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

export type BadgeVariant = "proposed" | "confirmed" | "rejected" | "external";

export const BADGE_STYLE: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
  proposed:  { bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE" },
  confirmed: { bg: "color-mix(in srgb, var(--kairo-color-ok) 8%, transparent)", color: "var(--kairo-color-ok)", border: "color-mix(in srgb, var(--kairo-color-ok) 24%, transparent)" },
  rejected:  { bg: "var(--kairo-color-hover)", color: "var(--kairo-color-faint)", border: "var(--kairo-color-line)" },
  external:  { bg: "color-mix(in srgb, var(--kairo-color-mood) 8%, transparent)", color: "var(--kairo-color-sla-escalate-ink)", border: "color-mix(in srgb, var(--kairo-color-mood) 24%, transparent)" },
};

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
// KPI cards (unchanged — still computed over clients only)
// ---------------------------------------------------------------------------

export function clientKpis(clients: Client[]): KpiItem[] {
  const active = clients.filter((c) => c.ticketCount > 0 || c.plan != null).length;
  const csatVals = clients.map((c) => c.csatAvg).filter((v): v is number => v != null);
  const csatAvg = csatVals.length ? (csatVals.reduce((a, b) => a + b, 0) / csatVals.length).toFixed(1) : null;
  const churnRisk = clients.filter((c) => c.slaLevel === "Critical").length;

  return [
    { label: "MRR TOTAL", value: null },
    { label: "ACTIVOS", value: `${active} / ${clients.length}` },
    { label: "CSAT PROMEDIO", value: csatAvg },
    { label: "RIESGO DE CHURN", value: churnRisk, urgent: churnRisk > 0 },
  ];
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

// ---------------------------------------------------------------------------
// Unified ContactRow card/row
// ---------------------------------------------------------------------------

export function ContactCard({
  row,
  isLast,
  isNew = false,
  onSelect,
  onEdit,
  onDelete,
  onQuickConfirm,
  deleting,
}: {
  row: ContactRow;
  isLast: boolean;
  isNew?: boolean;
  onSelect: (row: ContactRow) => void;
  onEdit?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  onQuickConfirm?: (e: React.MouseEvent) => void;
  deleting?: boolean;
}) {
  const { t } = useTranslation("clients");
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isDraft = row.source === "draft";
  const isProposedDraft = isDraft && row.status === "proposed";

  return (
    <Text tag="div" role="button" tabIndex={0} onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setMenuOpen(false); }} onClick={() => onSelect(row)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(row); } }} grid gridTemplateColumns="2.5fr 1fr 0.8fr 0.8fr 1fr 0.8fr 36px" paddingVertical={12} paddingHorizontal={16} borderBottomWidth={isLast ? 0 : 1} borderStyle="solid" borderBottomColor="var(--k-border-subtle)" alignItems="center" fontSize={13} cursor="pointer" backgroundColor={hover ? "var(--k-surface)" : isNew ? "rgba(43,91,255,0.04)" : "transparent"} transition="background 0.1s" cssAnimation={isNew ? "kairo-row-in 0.5s ease-out" : undefined}>
      {/* CLIENTE / BORRADOR */}
      <Box display="flex" gap={10} alignItems="center" minWidth={0}>
        <Avatar name={row.displayName} seed={row.id} size={32} />
        <Box minWidth={0} flexGrow={1} flexShrink={1} flexBasis="0%">
          <Box display="flex" alignItems="center" gap={6} flexWrap="wrap">
            <Text fontWeight={500} color="var(--k-text-primary)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap">
              {row.displayName}
            </Text>
            <StatusBadge status={row.status} />
            {row.externalSource && <ExternalSourceBadge source={row.externalSource} />}
          </Box>
          <Text tag="div" fontSize={11} color="var(--k-text-tertiary)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" marginTop={1} display="block">
            {row.organization
              ? `${row.organization} · ${row.email ?? row.phone ?? ""}`
              : (row.email ?? row.phone ?? "—")}
          </Text>
        </Box>
      </Box>

      {/* PLAN — only for clients */}
      <Box display="flex" alignItems="center" gap={6}>
        {!isDraft && row.plan ? (
          <>
            <Text width={6} height={6} circle flexShrink={0} backgroundColor={PLAN_DOT[row.plan] ?? "var(--kairo-color-faint)"} />
            <span>{PLAN_LABEL[row.plan] ?? row.plan}</span>
          </>
        ) : (
          <Text color="var(--k-text-tertiary)">—</Text>
        )}
      </Box>

      {/* MRR */}
      <Text font="mono" color="var(--k-text-secondary)">—</Text>

      {/* TICKETS */}
      <Text font="mono">{row.ticketCount}</Text>

      {/* CSAT */}
      {!isDraft ? <CsatCell value={row.csatAvg} /> : <Text color="var(--k-text-tertiary)" font="mono">—</Text>}

      {/* ÚLTIMO CONTACTO */}
      <Text font="mono" fontSize={12} color="var(--k-text-tertiary)">
        {relativeTime(row.lastSeenAt)}
      </Text>

      {/* ACTIONS */}
      <Box position="relative">
        {isProposedDraft && (
          <Pressable onClick={(e) => { e.stopPropagation(); onQuickConfirm?.(e); }} title={t("actions.confirm")} display="flex" alignItems="center" gap={4} paddingVertical={3} paddingHorizontal={8} borderRadius={5} backgroundColor="color-mix(in srgb, var(--kairo-color-ok) 8%, transparent)" borderWidth={1} borderColor="color-mix(in srgb, var(--kairo-color-ok) 24%, transparent)" cursor="pointer" color="var(--kairo-color-ok)" fontSize={11} fontWeight={600} opacity={hover ? 1 : 0} transition="opacity 0.1s" borderStyle="solid">
            <Icon name="check" size={11} />
            {t("actions.confirm")}
          </Pressable>
        )}
        {!isDraft && (
          <>
            <Pressable onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }} padding={4} borderRadius={5} backgroundColor="transparent" borderWidth={0} cursor="pointer" color="var(--k-text-tertiary)" opacity={hover ? 1 : 0} transition="opacity 0.1s">
              <Icon name="more" size={14} />
            </Pressable>
            {menuOpen && (
              <Box position="absolute" right={0} top="calc(100% + 4px)" zIndex={20} backgroundColor="white" borderWidth={1} borderColor="var(--k-border)" borderRadius={8} boxShadow="0 4px 12px rgba(9,9,11,0.1)" minWidth={140} overflow="hidden" borderStyle="solid">
                <Pressable onClick={(e) => { setMenuOpen(false); onEdit?.(e); }} hoverStyle={{ backgroundColor: "var(--k-surface)" }} display="flex" alignItems="center" gap={8} width="100%" paddingVertical={9} paddingHorizontal={12} fontSize={13} backgroundColor="transparent" borderWidth={0} cursor="pointer" color="var(--k-text-primary)">
                  <Icon name="draft" size={13} color="var(--k-text-tertiary)" /> Editar
                </Pressable>
                <Pressable onClick={(e) => { setMenuOpen(false); onDelete?.(e); }} disabled={deleting} hoverStyle={{ backgroundColor: "var(--kairo-color-bad-soft)" }} display="flex" alignItems="center" gap={8} width="100%" paddingVertical={9} paddingHorizontal={12} fontSize={13} backgroundColor="transparent" borderWidth={0} cursor="pointer" color="var(--kairo-color-bad-ink)">
                  {deleting
                    ? <Spinner />
                    : <Icon name="trash" size={13} />}
                  Eliminar
                </Pressable>
              </Box>
            )}
          </>
        )}
      </Box>
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

