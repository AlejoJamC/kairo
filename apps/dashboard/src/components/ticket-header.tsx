import { getEmotionTokens, getPriorityTokens } from "@kairo/ui";
import type { Ticket } from "@kairo/types";

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
  const emotionTokens = getEmotionTokens(ticket.emotion);

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
      </div>

      <div className="ml-4 shrink-0">
        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
          {ticket.received_at ? new Date(ticket.received_at).toLocaleString() : ""}
        </span>
      </div>
    </div>
  );
}
