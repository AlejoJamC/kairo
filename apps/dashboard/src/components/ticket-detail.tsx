import { Mail } from "lucide-react";
import { ReplyBar } from "./reply-bar";
import { useTriageStore } from "@/stores/triage-store";

// ---------------------------------------------------------------------------
// Classification badge helpers
// ---------------------------------------------------------------------------

function PriorityBadge({ priority }: { priority: string }) {
  const classes: Record<string, string> = {
    P1: "bg-red-50 text-red-700 border border-red-200",
    P2: "bg-amber-50 text-amber-700 border border-amber-200",
    P3: "bg-zinc-100 text-zinc-600 border border-zinc-300",
  };
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        classes[priority] ?? "bg-zinc-100 text-zinc-600 border border-zinc-300"
      }`}
    >
      {priority}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const classes: Record<string, string> = {
    support: "bg-blue-50 text-blue-700 border border-blue-200",
    lead: "bg-green-50 text-green-700 border border-green-200",
    spam: "bg-zinc-100 text-zinc-500 border border-zinc-300",
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

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const classes: Record<string, string> = {
    urgente: "bg-red-50 text-red-700 border border-red-200",
    neutral: "bg-zinc-100 text-zinc-600 border border-zinc-300",
    casual: "bg-green-50 text-green-700 border border-green-200",
  };
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${
        classes[sentiment] ?? "bg-zinc-100 text-zinc-600 border border-zinc-300"
      }`}
    >
      {sentiment}
    </span>
  );
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const dotClass =
    confidence >= 0.9
      ? "bg-green-500"
      : confidence >= 0.7
        ? "bg-yellow-500"
        : "bg-red-500";

  const label =
    confidence >= 0.9 ? "high" : confidence >= 0.7 ? "medium" : "low — manual review suggested";

  return (
    <span className="flex items-center gap-1.5 text-xs text-zinc-500">
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      {Math.round(confidence * 100)}% confidence ({label})
    </span>
  );
}

// ---------------------------------------------------------------------------
// TicketDetail
// ---------------------------------------------------------------------------

export function TicketDetail() {
  const { tickets, selectedTicketId } = useTriageStore();
  const ticket = tickets.find((t) => t.id === selectedTicketId) ?? null;

  if (!ticket) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center bg-zinc-50">
        <Mail className="mb-3 h-10 w-10 text-zinc-300" />
        <p className="text-sm text-zinc-400">Select a ticket to view details</p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-zinc-50">
      {/* Fixed Header */}
      <div className="sticky top-0 z-10 flex items-start justify-between border-b bg-white px-6 py-3 shadow-sm">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="truncate text-base font-semibold text-zinc-900">{ticket.subject}</h2>
          <p className="text-xs text-zinc-500">
            From:{" "}
            <span className="font-medium text-zinc-700">
              {ticket.from_name
                ? `${ticket.from_name} <${ticket.from_email ?? ""}>`
                : (ticket.from_email ?? "Unknown")}
            </span>
          </p>
          {/* Classification badges row */}
          {(ticket.priority || ticket.ticket_type || ticket.sentiment) && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {ticket.priority && <PriorityBadge priority={ticket.priority} />}
              {ticket.ticket_type && <TypeBadge type={ticket.ticket_type} />}
              {ticket.sentiment && <SentimentBadge sentiment={ticket.sentiment} />}
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

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          {ticket.body_plain ? (
            <pre className="overflow-x-hidden whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-zinc-800">
              {ticket.body_plain}
            </pre>
          ) : ticket.snippet ? (
            <p className="text-sm leading-relaxed text-zinc-800">{ticket.snippet}</p>
          ) : (
            <p className="text-sm italic text-zinc-400">No email body available.</p>
          )}
        </div>

        {/* AI reasoning (if classified) */}
        {ticket.ai_reasoning && (
          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="mb-1 text-xs font-semibold text-blue-700">AI Reasoning</p>
            <p className="text-xs leading-relaxed text-blue-800">{ticket.ai_reasoning}</p>
          </div>
        )}
      </div>

      {/* Fixed bottom reply bar */}
      <ReplyBar />
    </div>
  );
}
