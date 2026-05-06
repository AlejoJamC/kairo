import { Mail } from "lucide-react";
import { ReplyBar } from "./reply-bar";
import { TicketHeader } from "./ticket-header";
import { useTriageStore } from "@/stores/triage-store";

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
      <TicketHeader ticket={ticket} />

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
