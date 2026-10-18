import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Ticket } from "@kairo/types";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { CategoryChip, Chip, Icon, PriorityGlyph } from "@kairo/ui";
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
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        gap: 8,
        borderBottom: "1px solid var(--k-border)",
        padding: "8px 16px",
        background: "white",
        flexShrink: 0,
        minHeight: 44,
      }}
    >
      {/* Ticket number pill */}
      {ticketNum && (
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--k-font-mono)",
            fontWeight: 600,
            padding: "3px 8px",
            borderRadius: 4,
            background: "var(--k-surface-2)",
            color: "var(--k-text-tertiary)",
            flexShrink: 0,
            letterSpacing: "0.02em",
          }}
        >
          {ticketNum}
        </span>
      )}

      {/* Classification badges */}
      {(ticket.priority || ticket.ticket_type || ticket.category) && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
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
        </div>
      )}

      {/* Correction trigger — hidden in read-only mode */}
      {!readOnly && ticket.classified_at && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {isCorrected && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 7px",
                borderRadius: 999,
                background: "var(--kairo-color-note-soft)",
                color: "var(--kairo-color-note)",
              }}
            >
              {t("correction.correctedBadge")}
            </span>
          )}
          <button
            onClick={() => setCorrectionOpen(true)}
            style={{
              fontSize: 11,
              color: "var(--k-text-tertiary)",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {t("correction.triggerLabel")}
          </button>
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Timestamp */}
      {ticket.received_at && (
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--k-font-mono)",
            padding: "3px 8px",
            borderRadius: 4,
            background: "var(--k-surface-2)",
            color: "var(--k-text-tertiary)",
            flexShrink: 0,
          }}
        >
          {new Date(ticket.received_at).toLocaleString()}
        </span>
      )}

      {/* Asignar a mí button — replaced by a read-only badge for historical tickets */}
      {readOnly ? (
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            padding: "3px 8px",
            borderRadius: 4,
            background: "var(--k-surface-2)",
            color: "var(--k-text-tertiary)",
            flexShrink: 0,
          }}
        >
          {t("ticketHeader.readOnlyBadge")}
        </span>
      ) : !isAssigned && !assignToMeEnabled ? null : (
        <button
          type="button"
          disabled={assigning || isAssigned}
          onClick={handleAssign}
          style={{
            fontSize: 12,
            fontWeight: 500,
            padding: "5px 12px",
            borderRadius: 6,
            border: isAssigned
              ? "1px solid color-mix(in srgb, var(--kairo-color-ok) 24%, transparent)"
              : "1px solid var(--k-accent)",
            background: isAssigned ? "color-mix(in srgb, var(--kairo-color-ok) 8%, transparent)" : "var(--k-accent)",
            color: isAssigned ? "var(--kairo-color-ok-ink)" : "white",
            cursor: assigning || isAssigned ? "default" : "pointer",
            flexShrink: 0,
            transition: "background 0.1s ease, color 0.1s ease",
          }}
        >
          {isAssigned
            ? t("ticketHeader.assigned", "Asignado")
            : assigning
              ? t("ticketHeader.assigning", "Asignando…")
              : t("ticketHeader.assignToMe", "Asignar a mí")}
        </button>
      )}

      {!readOnly && (
        <CorrectionDialog
          ticket={ticket}
          open={correctionOpen}
          onOpenChange={setCorrectionOpen}
          onCorrected={handleCorrected}
        />
      )}
    </div>
  );
}
