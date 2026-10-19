import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Ticket } from "@kairo/types";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { Box, Button, CategoryChip, Chip, Icon, PriorityGlyph, Text } from "@kairo/ui";
import { normalizeTicketCategory, normalizeTicketType } from "@/lib/ticket-labels";
import { INTERNAL_NOTES_ENABLED } from "@/lib/internal-notes-flags";
import { CorrectionDialog } from "@/components/correction-dialog";
import type { CorrectionFields } from "@/components/correction-dialog";
import { assignTicket } from "@kairo/client-core/endpoints";

// VITE_FF_ENABLE_ASSIGN_TO_ME — OFF unless exactly "true"; safe unset.
function isFlagEnabled(value: string | undefined): boolean {
  return value === "true";
}

const assignToMeEnabled = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_ASSIGN_TO_ME);

// ---------------------------------------------------------------------------
// TicketHeader
// ---------------------------------------------------------------------------

interface TicketHeaderProps {
  ticket: Ticket;
  // KAI-25 — true for historical tickets opened from the related-history
  // drawer (resolved/ai_resolved). Hides mutation actions (assign,
  // correction) so the header matches the read-only detail view.
  readOnly?: boolean;
}

export function TicketHeader({ ticket, readOnly = false }: TicketHeaderProps) {
  const { t } = useTranslation("dashboard");
  const { updateClassification } = useTriageStore();
  const [assigning, setAssigning] = useState(false);

  const isAssigned = !!ticket.assigned_to;

  // KAI-232 — note count for this ticket, from the shared store.
  const noteCount = useTriageStore((s) => s.noteCounts[ticket.id]?.notes) ?? 0;

  async function handleAssign() {
    if (assigning || isAssigned) return;
    setAssigning(true);
    try {
      const res = await assignTicket(ticket.id);
      if (res.ok) {
        const body = await res.json() as { ticket?: Partial<Ticket> };
        if (body.ticket) updateClassification(ticket.id, body.ticket);
      }
    } catch {
      // silent fail — user can retry
    } finally {
      setAssigning(false);
    }
  }

  const ticketNum = ticket.ticket_number ? `KAI-${ticket.ticket_number}` : null;
  const escalated = ticket.status === "escalated";

  return (
    <Box tag="header" sticky top={0} zIndex={10} display="flex" alignItems="center" gap={8} height={56} flexShrink={0} paddingLeft={24} paddingRight={12} backgroundColor="var(--k-bg)" borderBottomWidth={1} borderBottomColor="var(--k-border)" borderStyle="solid">
      <Text fontSize={12.5} color="var(--k-text-tertiary)" whiteSpace="nowrap">{t("ticketList.header")}</Text>
      <Icon name="right" size={12} color="var(--kairo-color-faint)" />
      {ticketNum && <Text font="mono" fontSize={12} fontWeight={500} color="var(--k-text-primary)">{ticketNum}</Text>}

      {/* KAI-232 spec A1 — how many internal notes this ticket carries. */}
      {INTERNAL_NOTES_ENABLED && noteCount > 0 && (
        <Chip tone="note" size="sm" alignSelf="center" icon={<Icon name="lock" size={9} />}>
          {t("notes.headerCount", { count: noteCount, defaultValue: "{{count}} notes" })}
        </Chip>
      )}
      {escalated && (
        <Chip size="sm" mono alignSelf="center" icon={<Icon name="escalate" size={9} />}>
          {t("ticketHeader.escalated")}
        </Chip>
      )}

      <Box flexGrow={1} flexShrink={1} flexBasis="0%" />

      {/* Timestamp */}
      {ticket.received_at && <Chip mono alignSelf="center">{new Date(ticket.received_at).toLocaleString()}</Chip>}

      {/* Asignar a mí button — replaced by a read-only badge for historical tickets */}
      {readOnly ? (
        <Chip alignSelf="center" icon={<Icon name="lock" size={11} />}>{t("ticketHeader.readOnlyBadge")}</Chip>
      ) : !isAssigned && !assignToMeEnabled ? null : (
        <Button
          variant={isAssigned ? "secondary" : "primary"}
          disabled={isAssigned}
          loading={assigning}
          loadingLabel={t("ticketHeader.assigning", "Asignando…")}
          icon={isAssigned ? <Icon name="check" size={12} color="var(--kairo-color-ok)" /> : undefined}
          onPress={handleAssign}
        >
          {isAssigned ? t("ticketHeader.assigned", "Asignado") : t("ticketHeader.assignToMe", "Asignar a mí")}
        </Button>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// TicketClassification — priority, type and category chips under the subject,
// with the correction trigger.
// ---------------------------------------------------------------------------

export function TicketClassification({ ticket, readOnly = false }: TicketHeaderProps) {
  const { t } = useTranslation("dashboard");
  const categoryKey = normalizeTicketCategory(ticket.category);
  const { applyCorrection, correctedTicketIds } = useTriageStore();
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const isCorrected = correctedTicketIds.has(ticket.id);

  function handleCorrected(fields: CorrectionFields) {
    const patch: Partial<Ticket> = {};
    if (fields.correct_priority)    patch.priority    = fields.correct_priority as Ticket["priority"];
    if (fields.correct_ticket_type) patch.ticket_type = fields.correct_ticket_type as Ticket["ticket_type"];
    if (fields.correct_category)    patch.category    = fields.correct_category as Ticket["category"];
    if (fields.correct_sentiment)   patch.sentiment   = fields.correct_sentiment as Ticket["sentiment"];
    applyCorrection(ticket.id, patch);
  }

  return (
    <Box display="flex" flexWrap="wrap" alignItems="center" gap={6}>
      {ticket.priority && (
        <Chip mono icon={<PriorityGlyph priority={ticket.priority} size={12} label={false} />}>
          {ticket.priority}
        </Chip>
      )}
      {ticket.ticket_type && (
        <CategoryChip
          scale="ticketType"
          value={normalizeTicketType(ticket.ticket_type)}
          label={t(`ticketTypes.${normalizeTicketType(ticket.ticket_type)}`)}
        />
      )}
      {categoryKey && (
        <CategoryChip scale="category" value={categoryKey} label={t(`ticketCategories.${categoryKey}`)} />
      )}

      {/* Correction trigger — hidden in read-only mode */}
      {!readOnly && ticket.classified_at && (
        <>
          {isCorrected && <Chip tone="note">{t("correction.correctedBadge")}</Chip>}
          <Button variant="ghost" size="sm" icon={<Icon name="flag" size={12} />} onPress={() => setCorrectionOpen(true)}>
            {t("correction.triggerLabel")}
          </Button>
          <CorrectionDialog
            ticket={ticket}
            open={correctionOpen}
            onOpenChange={setCorrectionOpen}
            onCorrected={handleCorrected}
          />
        </>
      )}
    </Box>
  );
}
