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

  const selectCls =
    "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50";

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />

        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">

          {/* Header */}
          <div className="mb-4 flex items-start justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-zinc-900">
                {t("correction.dialogTitle")}
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-xs text-zinc-500">
                {t("correction.dialogSubtitle")}
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1 text-zinc-400 hover:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-300">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          {/* Current AI values (context) */}
          <div className="mb-4 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
            AI: {[ticket.priority, ticket.ticket_type, ticket.category, ticket.sentiment]
              .filter(Boolean)
              .join(" · ") || "—"}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Priority */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                {t("correction.fieldPriority")}
              </label>
              <select
                className={selectCls}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={loading}
              >
                <option value="">—</option>
                {PRIORITY_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            {/* Ticket type */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                {t("correction.fieldType")}
              </label>
              <select
                className={selectCls}
                value={ticketType}
                onChange={(e) => setTicketType(e.target.value)}
                disabled={loading}
              >
                <option value="">—</option>
                {TYPE_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            {/* Category */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                {t("correction.fieldCategory")}
              </label>
              <select
                className={selectCls}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={loading}
              >
                <option value="">—</option>
                {CATEGORY_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            {/* Sentiment */}
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                {t("correction.fieldSentiment")}
              </label>
              <select
                className={selectCls}
                value={sentiment}
                onChange={(e) => setSentiment(e.target.value)}
                disabled={loading}
              >
                <option value="">—</option>
                {SENTIMENT_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1 flex items-center justify-between text-xs font-medium text-zinc-700">
                <span>{t("correction.fieldNotes")}</span>
                <span className={notes.length > NOTE_MAX ? "text-red-500" : "text-zinc-400"}>
                  {notes.length}/{NOTE_MAX}
                </span>
              </label>
              <textarea
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-400 disabled:opacity-50"
                rows={2}
                maxLength={NOTE_MAX}
                placeholder={t("correction.fieldNotesPlaceholder")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Error / success */}
            {error && <p className="text-xs text-red-500">{error}</p>}
            {success && (
              <p className="text-xs font-medium text-green-600">{t("correction.successMsg")}</p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <Dialog.Close
                type="button"
                className="rounded-md px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                disabled={loading}
              >
                {t("correction.cancel")}
              </Dialog.Close>
              <button
                type="submit"
                disabled={loading || notes.length > NOTE_MAX}
                className="flex items-center gap-1.5 rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-zinc-400"
              >
                {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {loading ? t("correction.submitting") : t("correction.submit")}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
