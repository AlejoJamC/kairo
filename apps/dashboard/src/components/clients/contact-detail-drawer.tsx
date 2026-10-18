import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type ContactRow } from "@kairo/client-core/contact-row";
import { confirmDraft, rejectDraft, unrejectDraft, editDraft, type EditPatch } from "@kairo/client-core/draft-actions";
import type { Client } from "@/types";
import { Avatar, Box, Icon, PlainInput, Pressable, Spinner, Text } from "@kairo/ui";
import { ExternalSourceBadge, StatusBadge, relativeTime } from "@/components/clients/contact-parts";

// ---------------------------------------------------------------------------
// ContactDetailDrawer — read-only slide-out for both source='client' and 'draft'.
// Editing/confirming/rejecting actions for drafts are KAI-228.
// CRM edit/delete for clients lives in the row menu, not in this drawer.
// ---------------------------------------------------------------------------

export function ContactDetailDrawer({
  row,
  client,
  onClose,
  onOptimisticRemove,
  onOptimisticRestore,
}: {
  row: ContactRow;
  client: Client | null;
  onClose: () => void;
  onOptimisticRemove?: (id: string) => void;
  onOptimisticRestore?: (id: string) => void;
}) {
  const { t } = useTranslation("clients");
  const isDraft = row.source === "draft";
  const draftRawId = row.id.replace("draft:", "");

  // Edit mode state
  const [editMode, setEditMode]     = useState(false);
  const [editValues, setEditValues] = useState({
    display_name: row.displayName ?? "",
    email:        row.email ?? "",
    phone:        row.phone ?? "",
    organization: row.organization ?? "",
  });
  const [editError, setEditError]   = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isProposed  = isDraft && row.status === "proposed";
  const isRejected  = isDraft && row.status === "rejected";
  const isConfirmed = isDraft && row.status === "confirmed";
  const isKairoCreated = (row as ContactRow & { origin?: string }).origin === "kairo_created" ||
    // fallback: external source absent → assume kairo_created for proposed drafts without external badge
    (!row.externalSource && isProposed);

  const handleConfirm = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      await confirmDraft(draftRawId, row.lastSeenAt);
      onOptimisticRemove?.(row.id);
    } catch {
      setActionError(t("errors.genericAction"));
      onOptimisticRestore?.(row.id);
    } finally {
      setActionBusy(false);
    }
  };

  const handleReject = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      await rejectDraft(draftRawId);
      onOptimisticRemove?.(row.id);
    } catch {
      setActionError(t("errors.genericAction"));
      onOptimisticRestore?.(row.id);
    } finally {
      setActionBusy(false);
    }
  };

  const handleUnreject = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      await unrejectDraft(draftRawId);
      onOptimisticRemove?.(row.id);
    } catch {
      setActionError(t("errors.genericAction"));
      onOptimisticRestore?.(row.id);
    } finally {
      setActionBusy(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setEditError(null);
    const patch: EditPatch = {
      display_name: editValues.display_name || null,
      email:        editValues.email || null,
      phone:        editValues.phone || null,
      organization: editValues.organization || null,
    };
    try {
      await editDraft(draftRawId, patch);
      setEditMode(false);
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error.message === "invalid_email_format") {
        setEditError(t("errors.invalidEmail"));
      } else if (error.message === "invalid_phone_format") {
        setEditError(t("errors.invalidPhone"));
      } else if (error.code === "merge_candidate") {
        setEditError(t("errors.mergeCandidate"));
      } else {
        setEditError(t("errors.genericSave"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Box onClick={onClose} fixed top={0} right={0} bottom={0} left={0} zIndex={30} backgroundColor="rgba(0,0,0,0.2)" />
      <Box role="dialog" aria-label={row.displayName} fixed top={0} right={0} bottom={0} zIndex={40} width={400} backgroundColor="white" boxShadow="-4px 0 16px rgba(9,9,11,0.08)" scroll display="flex" flexDirection="column">
        <Box display="flex" alignItems="flex-start" justifyContent="space-between" paddingTop={20} paddingHorizontal={24} paddingBottom={16} borderBottomWidth={1} borderBottomColor="var(--k-border)" flexShrink={0} borderStyle="solid">
          <Box display="flex" gap={10} alignItems="center" minWidth={0}>
            <Avatar name={row.displayName} seed={row.id} size={40} />
            <Box minWidth={0}>
              <Text tag="h2" fontSize={16} fontWeight={600} color="var(--k-text-primary)" font="display" margin={0} overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" display="block">
                {row.displayName}
              </Text>
              <Box display="flex" gap={6} marginTop={4} alignItems="center" flexWrap="wrap">
                <StatusBadge status={row.status} />
                {row.externalSource && <ExternalSourceBadge source={row.externalSource} />}
                {client && (
                  <Text fontSize={11} font="mono" color="var(--k-text-tertiary)">
                    {client.internalId}
                  </Text>
                )}
              </Box>
            </Box>
          </Box>
          <Pressable onClick={onClose} aria-label="Close" borderRadius={6} padding={6} backgroundColor="transparent" borderWidth={0} cursor="pointer" color="var(--k-text-tertiary)" marginLeft={8} flexShrink={0}>
            <Icon name="x" size={14} />
          </Pressable>
        </Box>

        <Box flexGrow={1} flexShrink={1} flexBasis="0%" scroll padding={24}>
          {/* KPI mini grid */}
          <Box grid gridTemplateColumns="1fr 1fr" gap={1} backgroundColor="var(--k-border-subtle)" borderWidth={1} borderColor="var(--k-border)" borderRadius={8} overflow="hidden" marginBottom={20} borderStyle="solid">
            {[
              { l: t("detail.plan"),    v: client?.plan ?? "—" },
              { l: t("detail.tickets"), v: String(row.ticketCount) },
              { l: t("detail.csat"),    v: client?.csatAvg != null ? String(client.csatAvg) : "—" },
              { l: t("detail.lastSeen"), v: relativeTime(row.lastSeenAt) },
            ].map((kpi) => (
              <Box key={kpi.l} backgroundColor="white" padding={10}>
                <Text tag="div" fontSize={10} font="mono" color="var(--k-text-tertiary)" textTransform="uppercase" letterSpacing={0.5} display="block">{kpi.l}</Text>
                <Text tag="div" fontSize={14} fontWeight={500} marginTop={2} color="var(--k-text-primary)" display="block">{kpi.v}</Text>
              </Box>
            ))}
          </Box>

          {row.organization && <DetailField label={t("detail.organization")} value={row.organization} />}
          {row.email && <DetailField label={t("detail.email")} value={row.email} />}
          {row.phone && <DetailField label={t("detail.phone")} value={row.phone} />}

          {/* CRM-only fields */}
          {client?.legalId && <DetailField label={t("detail.legalId")} value={client.legalId} />}

          {client && client.authorizedEmails.length > 0 && (
            <Box marginBottom={16}>
              <Text tag="p" fontSize={11} fontWeight={500} color="var(--k-text-tertiary)" textTransform="uppercase" letterSpacing={0.44} marginBottom={8} display="block">
                {t("detail.authorizedEmails")}
              </Text>
              <Box display="flex" flexWrap="wrap" gap={6}>
                {client.authorizedEmails.map((email) => (
                  <Text key={email} fontSize={12} paddingVertical={2} paddingHorizontal={8} borderRadius={999} borderWidth={1} borderColor="var(--k-border)" color="var(--k-text-secondary)" font="mono" borderStyle="solid">
                    {email}
                  </Text>
                ))}
              </Box>
            </Box>
          )}

          {client && client.contactPersons.length > 0 && (
            <div>
              <Text tag="p" fontSize={11} fontWeight={500} color="var(--k-text-tertiary)" textTransform="uppercase" letterSpacing={0.44} marginBottom={8} display="block">
                {t("detail.contactPersons")}
              </Text>
              <Box display="flex" flexDirection="column" gap={6}>
                {client.contactPersons.map((cp) => (
                  <Box key={cp.name} borderRadius={8} borderWidth={1} borderColor="var(--k-border)" paddingVertical={8} paddingHorizontal={12} borderStyle="solid">
                    <Text tag="p" fontSize={13} fontWeight={500} color="var(--k-text-primary)" margin={0} display="block">{cp.name}</Text>
                    <Text tag="p" fontSize={12} color="var(--k-text-tertiary)" margin={0} display="block">{cp.role}</Text>
                  </Box>
                ))}
              </Box>
            </div>
          )}

          {/* ── Draft action panel ── */}
          {isDraft && (
            <Box marginTop={20}>
              {/* Action error */}
              {actionError && (
                <Text tag="div" marginBottom={10} paddingVertical={8} paddingHorizontal={12} borderRadius={6} fontSize={12} backgroundColor="var(--kairo-color-bad-soft)" color="var(--kairo-color-bad-ink)" borderWidth={1} borderColor="var(--kairo-color-bad-line)" display="block" borderStyle="solid">
                  {actionError}
                </Text>
              )}

              {/* ── proposed + kairo_created: confirm / reject / edit ── */}
              {isProposed && isKairoCreated && !editMode && (
                <Box display="flex" flexDirection="column" gap={8}>
                  <Box display="flex" gap={8}>
                    <Pressable onClick={handleConfirm} disabled={actionBusy} flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" alignItems="center" justifyContent="center" gap={6} paddingVertical={9} paddingHorizontal={14} borderRadius={7} fontSize={13} fontWeight={600} cursor="pointer" backgroundColor="var(--kairo-color-ok)" color="white" borderWidth={0}>
                      {actionBusy ? <Spinner /> : <Icon name="check" size={13} />}
                      {t("actions.confirm")}
                    </Pressable>
                    <Pressable onClick={handleReject} disabled={actionBusy} flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" alignItems="center" justifyContent="center" gap={6} paddingVertical={9} paddingHorizontal={14} borderRadius={7} fontSize={13} fontWeight={600} cursor="pointer" backgroundColor="white" color="var(--kairo-color-bad-ink)" borderWidth={1} borderColor="var(--kairo-color-bad-line)" borderStyle="solid">
                      {actionBusy ? <Spinner /> : <Icon name="reject" size={13} />}
                      {t("actions.reject")}
                    </Pressable>
                  </Box>
                  <Pressable onClick={() => setEditMode(true)} display="flex" alignItems="center" justifyContent="center" gap={6} paddingVertical={7} paddingHorizontal={14} borderRadius={7} fontSize={13} cursor="pointer" backgroundColor="transparent" borderWidth={0} color="var(--k-text-secondary)" textDecoration="underline">
                    <Icon name="draft" size={12} />
                    {t("actions.edit")}
                  </Pressable>
                </Box>
              )}

              {/* ── proposed + kairo_created: edit mode ── */}
              {isProposed && isKairoCreated && editMode && (
                <Box display="flex" flexDirection="column" gap={10}>
                  {(["display_name", "email", "phone", "organization"] as const).map((field) => (
                    <div key={field}>
                      <Text tag="label" display="block" fontSize={11} fontWeight={500} color="var(--k-text-tertiary)" textTransform="uppercase" letterSpacing={0.44} marginBottom={4}>
                        {field === "display_name" ? "Nombre" : field === "email" ? t("detail.email") : field === "phone" ? t("detail.phone") : t("detail.organization")}
                      </Text>
                      <PlainInput value={editValues[field]} onChange={(e) => setEditValues((v) => ({ ...v, [field]: e.target.value }))} width="100%" paddingVertical={7} paddingHorizontal={10} fontSize={13} borderRadius={6} borderWidth={1} borderColor="var(--k-border)" outlineWidth={0} color="var(--k-text-primary)" backgroundColor="white" borderStyle="solid" />
                    </div>
                  ))}
                  {editError && (
                    <Text tag="div" fontSize={12} color="var(--kairo-color-bad-ink)" paddingVertical={6} paddingHorizontal={10} backgroundColor="var(--kairo-color-bad-soft)" borderRadius={6} borderWidth={1} borderColor="var(--kairo-color-bad-line)" display="block" borderStyle="solid">
                      {editError}
                    </Text>
                  )}
                  <Box display="flex" gap={8}>
                    <Pressable onClick={handleSave} disabled={saving} flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" alignItems="center" justifyContent="center" gap={6} paddingVertical={8} paddingHorizontal={14} borderRadius={6} fontSize={13} fontWeight={600} cursor="pointer" backgroundColor="var(--kairo-color-accent)" color="white" borderWidth={0}>
                      {saving && <Spinner />}
                      {t("actions.save")}
                    </Pressable>
                    <Pressable onClick={() => { setEditMode(false); setEditError(null); }} disabled={saving} flexGrow={1} flexShrink={1} flexBasis="0%" paddingVertical={8} paddingHorizontal={14} borderRadius={6} fontSize={13} cursor="pointer" backgroundColor="white" borderWidth={1} borderColor="var(--k-border)" color="var(--k-text-secondary)" borderStyle="solid">
                      {t("actions.cancel")}
                    </Pressable>
                  </Box>
                </Box>
              )}

              {/* ── proposed + external_synced: confirm/reject only, no edit ── */}
              {isProposed && !isKairoCreated && (
                <Box display="flex" flexDirection="column" gap={8}>
                  <Text tag="p" fontSize={11} color="var(--k-text-tertiary)" marginTop={0} marginHorizontal={0} marginBottom={4} fontStyle="italic" display="block">
                    {t("actions.externalReadOnly", { source: row.externalSource ?? "external" })}
                  </Text>
                  <Box display="flex" gap={8}>
                    <Pressable onClick={handleConfirm} disabled={actionBusy} flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" alignItems="center" justifyContent="center" gap={6} paddingVertical={9} paddingHorizontal={14} borderRadius={7} fontSize={13} fontWeight={600} cursor="pointer" backgroundColor="var(--kairo-color-ok)" color="white" borderWidth={0}>
                      {actionBusy ? <Spinner /> : <Icon name="check" size={13} />}
                      {t("actions.confirm")}
                    </Pressable>
                    <Pressable onClick={handleReject} disabled={actionBusy} flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" alignItems="center" justifyContent="center" gap={6} paddingVertical={9} paddingHorizontal={14} borderRadius={7} fontSize={13} fontWeight={600} cursor="pointer" backgroundColor="white" color="var(--kairo-color-bad-ink)" borderWidth={1} borderColor="var(--kairo-color-bad-line)" borderStyle="solid">
                      {actionBusy ? <Spinner /> : <Icon name="reject" size={13} />}
                      {t("actions.reject")}
                    </Pressable>
                  </Box>
                </Box>
              )}

              {/* ── rejected: re-activate ── */}
              {isRejected && (
                <Pressable onClick={handleUnreject} disabled={actionBusy} width="100%" display="flex" alignItems="center" justifyContent="center" gap={6} paddingVertical={9} paddingHorizontal={14} borderRadius={7} fontSize={13} fontWeight={600} cursor="pointer" backgroundColor="white" borderWidth={1} borderColor="var(--k-border)" color="var(--k-text-secondary)" borderStyle="solid">
                  {actionBusy ? <Spinner /> : <Icon name="undo" size={13} />}
                  {t("actions.reactivate")}
                </Pressable>
              )}

              {/* ── confirmed: read-only with date ── */}
              {isConfirmed && (
                <Text tag="p" fontSize={12} color="var(--k-text-tertiary)" margin={0} display="block">
                  {t("actions.confirmedOn", { date: row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleDateString() : "—" })}
                </Text>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </>
  );
}

// ---------------------------------------------------------------------------
// DetailField — small reusable label/value row inside the drawer
// ---------------------------------------------------------------------------

export function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <Box marginBottom={16}>
      <Text tag="p" fontSize={11} fontWeight={500} color="var(--k-text-tertiary)" textTransform="uppercase" letterSpacing={0.44} marginBottom={4} display="block">
        {label}
      </Text>
      <Text tag="p" fontSize={13} color="var(--k-text-primary)" margin={0} wordBreak="break-word" display="block">
        {value}
      </Text>
    </Box>
  );
}

