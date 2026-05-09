import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "radix-ui";
import { X, Loader2 } from "lucide-react";
import { apiCall } from "@/lib/api-client";
import type { Ticket } from "@kairo/types";

// ---------------------------------------------------------------------------
// Option lists — must stay in sync with DB CHECK constraints
// ---------------------------------------------------------------------------

const PRIORITY_OPTIONS   = ["P1", "P2", "P3"] as const;
const TYPE_OPTIONS       = ["support", "prospect", "spam", "internal", "other"] as const;
const CATEGORY_OPTIONS   = ["technical", "billing", "account", "general", "not_applicable"] as const;
const SENTIMENT_OPTIONS  = ["aggressive", "frustrated", "neutral", "positive"] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CorrectionFields {
  correct_ticket_type?: string;
  correct_priority?: string;
  correct_category?: string;
  correct_sentiment?: string;
}

interface CorrectionDialogProps {
  ticket: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCorrected: (fields: CorrectionFields) => void;
}

// ---------------------------------------------------------------------------
// CorrectionDialog
// ---------------------------------------------------------------------------

export function CorrectionDialog({
  ticket,
  open,
  onOpenChange,
  onCorrected,
}: CorrectionDialogProps) {
  const { t } = useTranslation("dashboard");

  const [priority,   setPriority]   = useState("");
  const [ticketType, setTicketType] = useState("");
  const [category,   setCategory]   = useState("");
  const [sentiment,  setSentiment]  = useState("");
  const [notes,      setNotes]      = useState("");

  const [loading, setLoading]   = useState(false);
  const [error,   setError]     = useState<string | null>(null);
  const [success, setSuccess]   = useState(false);

  const NOTE_MAX = 2000;

  function resetForm() {
    setPriority("");
    setTicketType("");
    setCategory("");
    setSentiment("");
    setNotes("");
    setError(null);
    setSuccess(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!priority && !ticketType && !category && !sentiment) {
      setError(t("correction.errorEmpty"));
      return;
    }

    const body: Record<string, string> = {};
    if (priority)   body.correct_priority    = priority;
    if (ticketType) body.correct_ticket_type = ticketType;
    if (category)   body.correct_category    = category;
    if (sentiment)  body.correct_sentiment   = sentiment;
    if (notes.trim()) body.notes = notes.trim();

    setLoading(true);
    setError(null);

    try {
      const res = await apiCall(`/api/v1/tickets/${ticket.id}/correct-classification`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        setError(t("correction.errorGeneric"));
        return;
      }

      setSuccess(true);
      onCorrected(body as CorrectionFields);

      // Close after brief success flash
      setTimeout(() => handleOpenChange(false), 900);
    } catch {
      setError(t("correction.errorGeneric"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 40,
            background: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(2px)",
          }}
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        />

        <Dialog.Content
          style={{
            position: "fixed",
            left: "50%",
            top: "50%",
            zIndex: 50,
            width: "100%",
            maxWidth: 440,
            transform: "translate(-50%, -50%)",
            background: "white",
            borderRadius: 12,
            padding: 24,
            boxShadow: "0 4px 16px rgba(9,9,11,0.08), 0 1px 2px rgba(9,9,11,0.04)",
          }}
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
            <div>
              <Dialog.Title style={{ fontSize: 15, fontWeight: 600, color: "var(--k-text-primary)", fontFamily: "var(--k-font-display)", margin: 0 }}>
                {t("correction.dialogTitle")}
              </Dialog.Title>
              <Dialog.Description style={{ marginTop: 2, fontSize: 12, color: "var(--k-text-tertiary)" }}>
                {t("correction.dialogSubtitle")}
              </Dialog.Description>
            </div>
            <Dialog.Close
              style={{ borderRadius: 6, padding: 4, color: "var(--k-text-tertiary)", background: "none", border: "none", cursor: "pointer" }}
            >
              <X style={{ width: 16, height: 16 }} />
            </Dialog.Close>
          </div>

          {/* Current AI values */}
          <div style={{ marginBottom: 16, borderRadius: 6, background: "var(--k-surface)", border: "1px solid var(--k-border-subtle)", padding: "6px 10px", fontSize: 11, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)" }}>
            AI: {[ticket.priority, ticket.ticket_type, ticket.category, ticket.sentiment]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Priority */}
            <div>
              <label className="k-label">{t("correction.fieldPriority")}</label>
              <select className="k-select" value={priority} onChange={(e) => setPriority(e.target.value)} disabled={loading}>
                <option value="">—</option>
                {PRIORITY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            {/* Ticket type */}
            <div>
              <label className="k-label">{t("correction.fieldType")}</label>
              <select className="k-select" value={ticketType} onChange={(e) => setTicketType(e.target.value)} disabled={loading}>
                <option value="">—</option>
                {TYPE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="k-label">{t("correction.fieldCategory")}</label>
              <select className="k-select" value={category} onChange={(e) => setCategory(e.target.value)} disabled={loading}>
                <option value="">—</option>
                {CATEGORY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            {/* Sentiment */}
            <div>
              <label className="k-label">{t("correction.fieldSentiment")}</label>
              <select className="k-select" value={sentiment} onChange={(e) => setSentiment(e.target.value)} disabled={loading}>
                <option value="">—</option>
                {SENTIMENT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="k-label" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>{t("correction.fieldNotes")}</span>
                <span style={{ color: notes.length > NOTE_MAX ? "#EF4444" : "var(--k-text-tertiary)", fontFamily: "var(--k-font-mono)", fontSize: 11 }}>
                  {notes.length}/{NOTE_MAX}
                </span>
              </label>
              <textarea
                className="k-textarea"
                rows={2}
                maxLength={NOTE_MAX}
                placeholder={t("correction.fieldNotesPlaceholder")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Error / success */}
            {error   && <p style={{ fontSize: 12, color: "#EF4444", margin: 0 }}>{error}</p>}
            {success && <p style={{ fontSize: 12, color: "#10B981", fontWeight: 500, margin: 0 }}>{t("correction.successMsg")}</p>}

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, paddingTop: 4 }}>
              <Dialog.Close
                type="button"
                disabled={loading}
                className="k-btn-secondary"
              >
                {t("correction.cancel")}
              </Dialog.Close>
              <button
                type="submit"
                disabled={loading || notes.length > NOTE_MAX}
                className="k-btn-primary"
              >
                {loading && <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />}
                {loading ? t("correction.submitting") : t("correction.submit")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
