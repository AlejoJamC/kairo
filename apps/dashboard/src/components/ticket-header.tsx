import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Ticket } from "@kairo/types";
import { useTriageStore } from "@/stores/triage-store";
import { CorrectionDialog } from "@/components/correction-dialog";
import type { CorrectionFields } from "@/components/correction-dialog";
import { apiCall } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Priority badge
// ---------------------------------------------------------------------------

const PRIORITY_STYLE: Record<string, React.CSSProperties> = {
  P1: { background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA" },
  P2: { background: "#FFF7ED", color: "#C2410C", border: "1px solid #FED7AA" },
  P3: { background: "#FFFBEB", color: "#B45309", border: "1px solid #FDE68A" },
  P4: { background: "#F4F4F5", color: "#71717A", border: "1px solid #E4E4E7" },
};

function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  if (!priority) return null;
  const p = priority.toUpperCase();
  const style = PRIORITY_STYLE[p] ?? { background: "#F4F4F5", color: "#71717A", border: "1px solid #E4E4E7" };
  return (
    <span style={{ ...style, fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 999 }}>
      {p}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Type badge
// ---------------------------------------------------------------------------

function TypeBadge({ type }: { type: string | null | undefined }) {
  if (!type) return null;
  const t = type.toLowerCase();
  let style: React.CSSProperties;
  if (t === "lead" || t === "prospect")
    style = { background: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0" };
  else if (t === "spam")
    style = { background: "#F4F4F5", color: "#71717A", border: "1px solid #E4E4E7" };
  else
    style = { background: "#EEF2FF", color: "#2B5BFF", border: "1px solid #C7D2FE" };

  return (
    <span style={{ ...style, fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 999 }}>
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TicketHeader
// ---------------------------------------------------------------------------

interface TicketHeaderProps {
  ticket: Ticket;
}

export function TicketHeader({ ticket }: TicketHeaderProps) {
  const { t } = useTranslation("dashboard");
  const { applyCorrection, correctedTicketIds, updateClassification } = useTriageStore();
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [assigning, setAssigning] = useState(false);

  const isCorrected = correctedTicketIds.has(ticket.id);
  const isAssigned = !!ticket.assigned_to;

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
      const res = await apiCall(`/api/v1/tickets/${ticket.id}/assign`, { method: "PATCH" });
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

  const ticketNum = ticket.ticket_number ? `KAI-T-${ticket.ticket_number}` : null;

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
          <PriorityBadge priority={ticket.priority} />
          <TypeBadge type={ticket.ticket_type} />
          {ticket.category && (
            <span
              style={{
                fontSize: 11,
                padding: "2px 7px",
                borderRadius: 999,
                background: "#F4F4F5",
                color: "#52525B",
                border: "1px solid #E4E4E7",
              }}
            >
              {ticket.category}
            </span>
          )}
        </div>
      )}

      {/* Correction trigger */}
      {ticket.classified_at && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {isCorrected && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 7px",
                borderRadius: 999,
                background: "#FEF3C7",
                color: "#B45309",
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

      {/* Asignar a mí button */}
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
            ? "1px solid #A7F3D0"
            : "1px solid var(--k-accent)",
          background: isAssigned ? "#ECFDF5" : "var(--k-accent)",
          color: isAssigned ? "#047857" : "white",
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

      <CorrectionDialog
        ticket={ticket}
        open={correctionOpen}
        onOpenChange={setCorrectionOpen}
        onCorrected={handleCorrected}
      />
    </div>
  );
}
