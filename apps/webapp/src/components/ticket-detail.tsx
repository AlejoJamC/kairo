import type { GmailTicket } from "@/types";
import { ReplyBar } from "./reply-bar";
import { Mail } from "lucide-react";

interface TicketDetailProps {
  ticket: GmailTicket | null;
}

export function TicketDetail({ ticket }: TicketDetailProps) {
  if (!ticket) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50">
        <Mail className="h-10 w-10 text-zinc-300 mb-3" />
        <p className="text-sm text-zinc-400">Select a ticket to view details</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      {/* Fixed Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-3 shadow-sm">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 className="truncate text-base font-semibold text-zinc-900">
            {ticket.subject}
          </h2>
          <p className="text-xs text-zinc-500">
            From:{" "}
            <span className="font-medium text-zinc-700">
              {ticket.from_name
                ? `${ticket.from_name} <${ticket.from_email}>`
                : ticket.from_email}
            </span>
          </p>
        </div>
        <div className="ml-4 flex shrink-0 items-center gap-2">
          {ticket.priority && (
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 border border-red-200">
              {ticket.priority}
            </span>
          )}
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
            {new Date(ticket.received_at).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          {ticket.body_plain ? (
            <pre className="whitespace-pre-wrap font-sans text-sm text-zinc-800 leading-relaxed">
              {ticket.body_plain}
            </pre>
          ) : ticket.snippet ? (
            <p className="text-sm text-zinc-800 leading-relaxed">
              {ticket.snippet}
            </p>
          ) : (
            <p className="text-sm text-zinc-400 italic">No email body available.</p>
          )}
        </div>
      </div>

      {/* Fixed bottom reply bar */}
      <ReplyBar />
    </div>
  );
}
