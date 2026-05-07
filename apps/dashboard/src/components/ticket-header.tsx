import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getEmotionTokens, getPriorityTokens } from "@kairo/ui";
import type { Ticket } from "@kairo/types";
import { useTriageStore } from "@/stores/triage-store";
import { CorrectionDialog } from "@/components/correction-dialog";
import type { CorrectionFields } from "@/components/correction-dialog";

function PriorityBadge({ priority }: { priority: string }) {
  const tokens = getPriorityTokens(priority);
  const cls = tokens
    ? `${tokens.badgeBg} ${tokens.badgeText} border ${tokens.badgeBorder}`
    : "bg-zinc-100 text-zinc-600 border border-zinc-300";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${cls}`}>{priority}</span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const classes: Record<string, string> = {
    support:  "bg-blue-50 text-blue-700 border border-blue-200",
    prospect: "bg-green-50 text-green-700 border border-green-200",
    internal: "bg-purple-50 text-purple-700 border border-purple-200",
    lead:     "bg-green-50 text-green-700 border border-green-200",
    spam:     "bg-zinc-100 text-zinc-500 border border-zinc-300",
  };
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        classes[type] ?? "bg-zinc-100 text-zinc-600 border border-zinc-300"
      }`}
    >
      {type}
    </span>
  );
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const dotClass =
    confidence >= 0.9 ? "bg-green-500" : confidence >= 0.7 ? "bg-yellow-500" : "bg-red-500";
  const label =
    confidence >= 0.9 ? "high" : confidence >= 0.7 ? "medium" : "low — manual review suggested";
  return (
    <span className="flex items-center gap-1.5 text-xs text-zinc-500">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      {Math.round(confidence * 100)}% confidence ({label})
    </span>
  );
}

interface TicketHeaderProps {
  ticket: Ticket;
}

export function TicketHeader({ ticket }: TicketHeaderProps) {
  const { t } = useTranslation("dashboard");
  const { applyCorrection, correctedTicketIds } = useTriageStore();
  const [correctionOpen, setCorrectionOpen] = useState(false);

  const isCorrected = correctedTicketIds.has(ticket.id);
  const emotionTokens = getEmotionTokens(ticket.emotion);

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
      className={`sticky top-0 z-10 flex items-start justify-between border-b px-6 py-3 shadow-sm transition-colors duration-300 ${emotionTokens.headerBg}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          {emotionTokens.emoji && (
            <span aria-label={emotionTokens.ariaLabel} role="img" className="text-base leading-none">
              {emotionTokens.emoji}
            </span>
          )}
          <h2
            className={`truncate text-base font-semibold ${emotionTokens.headerText}`}
          >
            {ticket.subject}
          </h2>
        </div>

        <p className="text-xs text-zinc-500">
          From:{" "}
          <span className="font-medium text-zinc-700">
            {ticket.from_name
              ? `${ticket.from_name} <${ticket.from_email ?? ""}>`
              : (ticket.from_email ?? "Unknown")}
          </span>
        </p>

        {(ticket.priority || ticket.ticket_type || ticket.sentiment) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {ticket.priority && <PriorityBadge priority={ticket.priority} />}
            {ticket.ticket_type && <TypeBadge type={ticket.ticket_type} />}
            {ticket.category && (
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600 border border-zinc-300">
                {ticket.category}
              </span>
            )}
          </div>
        )}

        {ticket.classification_confidence !== null &&
          ticket.classification_confidence !== undefined && (
            <ConfidenceDot confidence={ticket.classification_confidence} />
          )}

        {/* Correction trigger — only when classified */}
        {ticket.classified_at && (
          <div className="mt-1 flex items-center gap-2">
            {isCorrected && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700">
                {t("correction.correctedBadge")}
              </span>
            )}
            <button
              onClick={() => setCorrectionOpen(true)}
              className="text-[11px] text-zinc-400 underline underline-offset-2 hover:text-zinc-600"
            >
              {t("correction.triggerLabel")}
            </button>
          </div>
        )}
      </div>

      <div className="ml-4 shrink-0">
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
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
