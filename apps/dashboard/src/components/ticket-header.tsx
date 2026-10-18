import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Ticket } from "@kairo/types";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { Box, CategoryChip, Chip, Icon, Pressable, PriorityGlyph, Text } from "@kairo/ui";
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
  const categoryKey = normalizeTicketCategory(ticket.category);
  const { applyCorrection, correctedTicketIds, updateClassification } = useTriageStore();
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const isCorrected = correctedTicketIds.has(ticket.id);
  const isAssigned = !!ticket.assigned_to;

  // KAI-232 — note count for this ticket, from the shared store.
  const noteCount = useTriageStore((s) => s.noteCounts[ticket.id]?.notes) ?? 0;

  function handleCorrected(fields: CorrectionFields) {
    const patch: Partial<Ticket> = {};
    if (fields.correct_priority)    patch.priority    = fields.correct_priority as Ticket["priority"];
    if (fields.correct_ticket_type) patch.ticket_type = fields.correct_ticket_type as Ticket["ticket_type"];
    if (fields.correct_category)    patch.category    = fields.correct_category as Ticket["category"];
    if (fields.correct_sentiment)   patch.sentiment   = fields.correct_sentiment as Ticket["sentiment"];
    applyCorrection(ticket.id, patch);
  }

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

  return (
    <Box sticky top={0} zIndex={10} display="flex" alignItems="center" gap={8} borderBottomWidth={1} borderBottomColor="var(--k-border)" paddingVertical={8} paddingHorizontal={16} backgroundColor="white" flexShrink={0} minHeight={44} borderStyle="solid">
      {/* Ticket number pill */}
      {ticketNum && (
        <Text fontSize={11} font="mono" fontWeight={600} paddingVertical={3} paddingHorizontal={8} borderRadius={4} backgroundColor="var(--k-surface-2)" color="var(--k-text-tertiary)" flexShrink={0} letterSpacing={0.22}>
          {ticketNum}
        </Text>
      )}

      {/* Classification badges */}
      {(ticket.priority || ticket.ticket_type || ticket.category) && (
        <Box display="flex" alignItems="center" gap={4} flexShrink={0}>
          <PriorityGlyph priority={ticket.priority} />
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
          {/* KAI-232 spec A1 — how many internal notes this ticket carries. */}
          {INTERNAL_NOTES_ENABLED && noteCount > 0 && (
            <Chip tone="note" icon={<Icon name="lock" size={9} />}>
              {t("notes.headerCount", { count: noteCount, defaultValue: "{{count}} notes" })}
            </Chip>
          )}
        </Box>
      )}

      {/* Correction trigger — hidden in read-only mode */}
      {!readOnly && ticket.classified_at && (
        <Box display="flex" alignItems="center" gap={6} flexShrink={0}>
          {isCorrected && (
            <Text fontSize={10} fontWeight={600} paddingVertical={2} paddingHorizontal={7} borderRadius={999} backgroundColor="var(--kairo-color-note-soft)" color="var(--kairo-color-note)">
              {t("correction.correctedBadge")}
            </Text>
          )}
          <Pressable onClick={() => setCorrectionOpen(true)} fontSize={11} color="var(--k-text-tertiary)" textDecoration="underline" textUnderlineOffset={2} backgroundColor="transparent" borderWidth={0} cursor="pointer" padding={0}>
            {t("correction.triggerLabel")}
          </Pressable>
        </Box>
      )}

      {/* Spacer */}
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" />

      {/* Timestamp */}
      {ticket.received_at && (
        <Text fontSize={11} font="mono" paddingVertical={3} paddingHorizontal={8} borderRadius={4} backgroundColor="var(--k-surface-2)" color="var(--k-text-tertiary)" flexShrink={0}>
          {new Date(ticket.received_at).toLocaleString()}
        </Text>
      )}

      {/* Asignar a mí button — replaced by a read-only badge for historical tickets */}
      {readOnly ? (
        <Text fontSize={11} fontWeight={600} paddingVertical={3} paddingHorizontal={8} borderRadius={4} backgroundColor="var(--k-surface-2)" color="var(--k-text-tertiary)" flexShrink={0}>
          {t("ticketHeader.readOnlyBadge")}
        </Text>
      ) : !isAssigned && !assignToMeEnabled ? null : (
        <Pressable type="button" disabled={assigning || isAssigned} onClick={handleAssign} fontSize={12} fontWeight={500} paddingVertical={5} paddingHorizontal={12} borderRadius={6} borderWidth={1} borderColor={isAssigned ? "color-mix(in srgb, var(--kairo-color-ok) 24%, transparent)" : "var(--k-accent)"} backgroundColor={isAssigned ? "color-mix(in srgb, var(--kairo-color-ok) 8%, transparent)" : "var(--k-accent)"} color={isAssigned ? "var(--kairo-color-ok-ink)" : "white"} cursor={assigning || isAssigned ? "default" : "pointer"} flexShrink={0} transition="background 0.1s ease, color 0.1s ease" borderStyle="solid">
          {isAssigned
            ? t("ticketHeader.assigned", "Asignado")
            : assigning
              ? t("ticketHeader.assigning", "Asignando…")
              : t("ticketHeader.assignToMe", "Asignar a mí")}
        </Pressable>
      )}

      {!readOnly && (
        <CorrectionDialog
          ticket={ticket}
          open={correctionOpen}
          onOpenChange={setCorrectionOpen}
          onCorrected={handleCorrected}
        />
      )}
    </Box>
  );
}
