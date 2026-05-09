import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Ticket } from "@kairo/types";
import { useTriageStore } from "@/stores/triage-store";
import { CorrectionDialog } from "@/components/correction-dialog";
import type { CorrectionFields } from "@/components/correction-dialog";

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
    <span
      style={{
        ...style,
        fontSize: 11,
        fontWeight: 600,
        padding: "3px 8px",
        borderRadius: 999,
      }}
    >
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
    <span
      style={{
        ...style,
        fontSize: 11,
        fontWeight: 500,
        padding: "3px 8px",
        borderRadius: 999,
      }}
    >
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Confidence dot
// ---------------------------------------------------------------------------

function ConfidenceDot({ confidence }: { confidence: number }) {
  const dotColor =
    confidence >= 0.9 ? "#10B981" : confidence >= 0.7 ? "#F59E0B" : "#EF4444";
  const label =
    confidence >= 0.9 ? "high" : confidence >= 0.7 ? "medium" : "low — manual review suggested";
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--k-text-tertiary)",
      }}
    >
      <span
        style={{ width: 8, height: 8, borderRadius: 999, background: dotColor, flexShrink: 0 }}
      />
      {Math.round(confidence * 100)}% confidence ({label})
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
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        borderBottom: "1px solid var(--k-border)",
        padding: "10px 16px",
        background: "white",
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        {/* Subject */}
        <h2
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "var(--k-text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            letterSpacing: "-0.01em",
            margin: 0,
          }}
        >
          {ticket.subject}
        </h2>

        {/* From */}
        <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", margin: 0 }}>
          {t("ticketHeader.from", "From")}:{" "}
          <span style={{ fontWeight: 500, color: "var(--k-text-secondary)" }}>
            {ticket.from_name
              ? `${ticket.from_name} <${ticket.from_email ?? ""}>`
              : (ticket.from_email ?? "Unknown")}
          </span>
        </p>

        {/* Badges */}
        {(ticket.priority || ticket.ticket_type || ticket.category) && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, marginTop: 2 }}>
            <PriorityBadge priority={ticket.priority} />
            <TypeBadge type={ticket.ticket_type} />
            {ticket.category && (
              <span
                style={{
                  fontSize: 11,
                  padding: "3px 8px",
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

        {/* Confidence */}
        {ticket.classification_confidence !== null &&
          ticket.classification_confidence !== undefined && (
            <ConfidenceDot confidence={ticket.classification_confidence} />
          )}

        {/* Correction trigger */}
        {ticket.classified_at && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            {isCorrected && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: "2px 8px",
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
      </div>

      {/* Timestamp */}
      <div style={{ marginLeft: 16, flexShrink: 0 }}>
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--k-font-mono)",
            padding: "3px 8px",
            borderRadius: 4,
            background: "var(--k-surface-2)",
            color: "var(--k-text-tertiary)",
          }}
        >
          {ticket.received_at ? new Date(ticket.received_at).toLocaleString() : ""}
        </span>
      </div>

      <CorrectionDialog
        ticket={ticket}
        open={correctionOpen}
        onOpenChange={setCorrectionOpen}
        onCorrected={handleCorrected}
      />
    </div>
  );
}
