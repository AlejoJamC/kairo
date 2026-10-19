import { useState } from "react";
import { useTranslation } from "react-i18next";

import { type ContactRow } from "@kairo/client-core/contact-row";
import { confirmDraft, rejectDraft, unrejectDraft, editDraft, type EditPatch } from "@kairo/client-core/draft-actions";
import type { Client } from "@/types";
import { Avatar, Box, Button, Callout, Chip, Drawer, Field, FieldInput, Icon, PropRow, Text } from "@kairo/ui";
import { ExternalSourceBadge, StatusBadge } from "@/components/clients/contact-parts";
import { relativeTime } from "@/components/clients/contact-helpers";

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

  const actionButtons = (
    <Box display="flex" gap={8}>
      <Box flexGrow={1} flexShrink={1} flexBasis="0%">
        <Button variant="primary" full loading={actionBusy} icon={<Icon name="check" size={13} color="var(--kairo-color-on-accent)" />} onPress={handleConfirm}>
          {t("actions.confirm")}
        </Button>
      </Box>
      <Box flexGrow={1} flexShrink={1} flexBasis="0%">
        <Button full disabled={actionBusy} icon={<Icon name="reject" size={13} />} onPress={handleReject}>
          {t("actions.reject")}
        </Button>
      </Box>
    </Box>
  );

  return (
    <Drawer open onOpenChange={(next) => { if (!next) onClose(); }} title={row.displayName} closeLabel={t("actions.close")}>
      <Box display="flex" gap={10} alignItems="center" minWidth={0} marginBottom={16}>
        <Avatar name={row.displayName} seed={row.id} size={40} />
        <Box display="flex" gap={6} alignItems="center" flexWrap="wrap">
          <StatusBadge status={row.status} />
          {row.externalSource && <ExternalSourceBadge source={row.externalSource} />}
          {client && (
            <Text fontSize={11} font="mono" color="var(--kairo-color-faint)">
              {client.internalId}
            </Text>
          )}
        </Box>
      </Box>

      <PropRow label={t("detail.plan")}>{client?.plan ?? "—"}</PropRow>
      <PropRow label={t("detail.tickets")} mono>{String(row.ticketCount)}</PropRow>
      <PropRow label={t("detail.csat")} mono>{client?.csatAvg != null ? String(client.csatAvg) : "—"}</PropRow>
      <PropRow label={t("detail.lastSeen")} mono>{relativeTime(row.lastSeenAt)}</PropRow>
      {row.organization && <PropRow label={t("detail.organization")}>{row.organization}</PropRow>}
      {row.email && <PropRow label={t("detail.email")}>{row.email}</PropRow>}
      {row.phone && <PropRow label={t("detail.phone")}>{row.phone}</PropRow>}

      {/* CRM-only fields */}
      {client?.legalId && <PropRow label={t("detail.legalId")}>{client.legalId}</PropRow>}

      {client && client.authorizedEmails.length > 0 && (
        <Box marginTop={16} marginBottom={16}>
          <Text tag="p" fontSize={11} fontWeight={500} color="var(--kairo-color-faint)" textTransform="uppercase" letterSpacing={0.44} marginBottom={8} display="block">
            {t("detail.authorizedEmails")}
          </Text>
          <Box display="flex" flexWrap="wrap" gap={6}>
            {client.authorizedEmails.map((email) => (
              <Chip key={email} mono>{email}</Chip>
            ))}
          </Box>
        </Box>
      )}

      {client && client.contactPersons.length > 0 && (
        <Box marginTop={16}>
          <Text tag="p" fontSize={11} fontWeight={500} color="var(--kairo-color-faint)" textTransform="uppercase" letterSpacing={0.44} marginBottom={8} display="block">
            {t("detail.contactPersons")}
          </Text>
          {client.contactPersons.map((cp, index) => (
            <PropRow key={cp.name} label={cp.name} last={index === client.contactPersons.length - 1}>{cp.role}</PropRow>
          ))}
        </Box>
      )}

      {/* ── Draft action panel ── */}
      {isDraft && (
        <Box marginTop={20}>
          {actionError && (
            <Box marginBottom={10}>
              <Callout tone="error">{actionError}</Callout>
            </Box>
          )}

          {/* proposed + kairo_created: confirm / reject / edit */}
          {isProposed && isKairoCreated && !editMode && (
            <Box display="flex" flexDirection="column" gap={8}>
              {actionButtons}
              <Button variant="link" icon={<Icon name="draft" size={12} color="var(--kairo-color-accent-ink)" />} onPress={() => setEditMode(true)}>
                {t("actions.edit")}
              </Button>
            </Box>
          )}

          {/* proposed + kairo_created: edit mode */}
          {isProposed && isKairoCreated && editMode && (
            <Box display="flex" flexDirection="column" gap={10}>
              {(["display_name", "email", "phone", "organization"] as const).map((field) => (
                <Field key={field} label={field === "display_name" ? "Nombre" : field === "email" ? t("detail.email") : field === "phone" ? t("detail.phone") : t("detail.organization")}>
                  <FieldInput value={editValues[field]} onChangeText={(value) => setEditValues((v) => ({ ...v, [field]: value }))} />
                </Field>
              ))}
              {editError && <Callout tone="error">{editError}</Callout>}
              <Box display="flex" gap={8}>
                <Box flexGrow={1} flexShrink={1} flexBasis="0%">
                  <Button variant="primary" full loading={saving} onPress={handleSave}>{t("actions.save")}</Button>
                </Box>
                <Box flexGrow={1} flexShrink={1} flexBasis="0%">
                  <Button full disabled={saving} onPress={() => { setEditMode(false); setEditError(null); }}>{t("actions.cancel")}</Button>
                </Box>
              </Box>
            </Box>
          )}

          {/* proposed + external_synced: confirm/reject only, no edit */}
          {isProposed && !isKairoCreated && (
            <Box display="flex" flexDirection="column" gap={8}>
              <Text tag="p" fontSize={11} color="var(--kairo-color-faint)" marginTop={0} marginHorizontal={0} marginBottom={4} fontStyle="italic" display="block">
                {t("actions.externalReadOnly", { source: row.externalSource ?? "external" })}
              </Text>
              {actionButtons}
            </Box>
          )}

          {/* rejected: re-activate */}
          {isRejected && (
            <Button full loading={actionBusy} icon={<Icon name="undo" size={13} />} onPress={handleUnreject}>
              {t("actions.reactivate")}
            </Button>
          )}

          {/* confirmed: read-only with date */}
          {isConfirmed && (
            <Text tag="p" fontSize={12} color="var(--kairo-color-faint)" margin={0} display="block">
              {t("actions.confirmedOn", { date: row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleDateString() : "—" })}
            </Text>
          )}
        </Box>
      )}
    </Drawer>
  );
}
