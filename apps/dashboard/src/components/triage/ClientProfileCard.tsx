import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { getPlatform } from "@kairo/client-core/config";
import { Box, Icon, Pressable, Skeleton, Text, getInitials } from "@kairo/ui";

const initials = (name: string | null) => getInitials(name);

// ---------------------------------------------------------------------------
// Skeleton — exported so parent can compose it
// ---------------------------------------------------------------------------

export function ClientProfileSkeleton() {
  return (
    <Box display="flex" flexDirection="column" gap={10}>
      <Box display="flex" alignItems="center" gap={10}>
        <Skeleton width={36} height={36} borderRadius={999} flexShrink={0} />
        <Box flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" flexDirection="column" gap={6}>
          <Skeleton height={11} width={112} />
          <Skeleton height={9} width={64} />
        </Box>
      </Box>
      <Box display="flex" gap={6}>
        <Skeleton height={16} width={56} borderRadius={999} />
        <Skeleton height={16} width={80} borderRadius={999} />
      </Box>
      <Skeleton height={10} width={144} />
    </Box>
  );
}

// ---------------------------------------------------------------------------
// ClientProfileCard — pure display, reads from store.
// Fetch is owned by the parent (AiAssistant) so it runs regardless of
// which tab is active.
// ---------------------------------------------------------------------------

interface ClientProfileCardProps {
  /** When true the parent is still loading — show skeleton */
  loading?: boolean;
}

export function ClientProfileCard({ loading = false }: ClientProfileCardProps) {
  const { t } = useTranslation("dashboard");
  const { selectedTicketId, clientProfile } = useTriageStore();

  const [copied, setCopied] = useState(false);

  if (!selectedTicketId) return null;

  if (loading) return <ClientProfileSkeleton />;

  if (!clientProfile) {
    return (
      <Text tag="p" fontSize={12} color="var(--k-text-tertiary)" fontStyle="italic" margin={0} display="block">
        {t("clientProfile.noData")}
      </Text>
    );
  }

  const { name, phone, clientId, email, organization } = clientProfile;
  const isDraft = clientProfile.source === "draft";
  const draftStatus = clientProfile.draftStatus;

  function handleCopyPhone() {
    if (!phone) return;
    getPlatform().clipboard.writeText(phone).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Box display="flex" flexDirection="column" gap={10}>

      {/* Avatar + name + draft badge */}
      <Box display="flex" alignItems="center" gap={10}>
        <Text tag="div" width={36} height={36} borderRadius={999} flexShrink={0} display="flex" alignItems="center" justifyContent="center" backgroundColor="var(--k-accent-subtle)" color="var(--k-accent)" fontSize={13} fontWeight={600}>
          {initials(name)}
        </Text>
        <Box minWidth={0} flexGrow={1} flexShrink={1} flexBasis="0%">
          <Box display="flex" alignItems="center" gap={6} flexWrap="wrap">
            <Text tag="p" fontSize={13} fontWeight={600} color="var(--k-text-primary)" lineHeight={16.9} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" margin={0} display="block">
              {name ?? email ?? t("clientProfile.unknown")}
            </Text>
            {/* KAI-227 — surface draft origin so the agent knows this profile came from
                the contact-extraction worker (KAI-225) and not from the CRM. */}
            {isDraft && draftStatus && <DraftStatusBadge status={draftStatus} />}
          </Box>
          {organization && (
            <Text tag="p" fontSize={11} color="var(--k-text-tertiary)" lineHeight={14.3} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" margin={0} display="block">
              {organization}
            </Text>
          )}
          {!isDraft && clientId && (
            <Text tag="p" fontSize={10} font="mono" color="var(--k-text-tertiary)" lineHeight={13} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" margin={0} display="block">
              {clientId}
            </Text>
          )}
        </Box>
      </Box>

      {/* Email row (only for drafts — for CRM clients, email lives in the KPI/details below) */}
      {isDraft && email && (
        <Text tag="div" display="flex" alignItems="center" gap={6} fontSize={12} color="var(--k-text-secondary)" paddingVertical={0} paddingHorizontal={8} font="mono" wordBreak="break-all">
          {email}
        </Text>
      )}

      {/* Phone copy */}
      {phone && (
        <Pressable onClick={handleCopyPhone} hoverStyle={{ backgroundColor: "var(--k-surface-2)" }} display="flex" width="100%" alignItems="center" gap={6} borderRadius={6} paddingVertical={5} paddingHorizontal={8} fontSize={12} color="var(--k-text-secondary)" backgroundColor="transparent" borderWidth={0} cursor="pointer" transition="background 0.1s">
          <Icon name="phone" size={11} color="var(--k-text-tertiary)" />
          <Text flexGrow={1} flexShrink={1} flexBasis="0%" textAlign="left" font="mono">{phone}</Text>
          {copied
            ? <Icon name="check" size={11} color="var(--kairo-color-ok)" />
            : <Icon name="copy" size={11} color="var(--k-text-tertiary)" />}
        </Pressable>
      )}

      {/* KAI-168 — operational SLA history for this client (own domain, separate
          from tenant_sla_rules). Only shown once we have a total ticket count. */}
      {!isDraft && clientProfile.totalTickets > 0 && (
        <Text tag="div" display="flex" alignItems="center" gap={6} fontSize={12} fontWeight={500} paddingVertical={6} paddingHorizontal={8} borderRadius={6} backgroundColor={clientProfile.slaBreachedCount > 0 ? "var(--kairo-color-bad-soft)" : "var(--k-surface-2)"} color={clientProfile.slaBreachedCount > 0 ? "var(--kairo-color-bad-ink)" : "var(--k-text-secondary)"}>
          {t("clientProfile.slaHistory", {
            breached: clientProfile.slaBreachedCount,
            total: clientProfile.totalTickets,
          })}
        </Text>
      )}

      {/* KAI-228 placeholder — confirm / reject / edit actions for drafts go here.
          Rendered only for drafts so the CRM card UI is untouched. */}
      {isDraft && (
        <Text tag="div" data-kai228-action-slot marginTop={4} paddingVertical={8} paddingHorizontal={10} fontSize={11} color="var(--k-text-tertiary)" backgroundColor="var(--k-surface-2)" borderWidth={1} borderColor="var(--k-border)" borderRadius={6} lineHeight={15.4} display="block" borderStyle="dashed">
          {t("clientProfile.draftActionsPending")}
        </Text>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Draft status badge — proposed / confirmed / rejected
// ---------------------------------------------------------------------------

const DRAFT_BADGE_STYLE: Record<"proposed" | "confirmed" | "rejected", { bg: string; color: string; border: string }> = {
  proposed:  { bg: "var(--kairo-color-accent-soft)", color: "var(--kairo-color-accent)", border: "var(--kairo-color-accent-line)" },
  confirmed: { bg: "color-mix(in srgb, var(--kairo-color-ok) 8%, transparent)", color: "var(--kairo-color-ok)", border: "color-mix(in srgb, var(--kairo-color-ok) 24%, transparent)" },
  rejected:  { bg: "var(--kairo-color-hover)", color: "var(--kairo-color-faint)", border: "var(--kairo-color-line)" },
};

function DraftStatusBadge({ status }: { status: "proposed" | "confirmed" | "rejected" }) {
  const { t } = useTranslation("dashboard");
  const s = DRAFT_BADGE_STYLE[status];
  const labelKey =
    status === "proposed"  ? "clientProfile.badgeDraft" :
    status === "confirmed" ? "clientProfile.badgeConfirmed" :
                             "clientProfile.badgeRejected";
  return (
    <Text fontSize={10} fontWeight={600} paddingVertical={2} paddingHorizontal={7} borderRadius={999} backgroundColor={s.bg} color={s.color} borderWidth={1} borderColor={s.border} letterSpacing={0.3} flexShrink={0} borderStyle="solid">
      {t(labelKey)}
    </Text>
  );
}
