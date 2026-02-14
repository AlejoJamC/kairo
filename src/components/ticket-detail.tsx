import type { Ticket } from "@/types";
import { conversationsByTicket, telemetryByTicket } from "@/data/dummy-data";
import { Conversation } from "./conversation";
import { TelemetryOverview } from "./telemetry-overview";
import { ReplyBar } from "./reply-bar";
import { Bot, MoreHorizontal } from "lucide-react";

interface TicketDetailProps {
  ticket: Ticket;
}

export function TicketDetail({ ticket }: TicketDetailProps) {
  const messages = conversationsByTicket[ticket.id] ?? [];
  const telemetry = telemetryByTicket[ticket.id];

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      {/* Header */}
      <div className="flex items-start justify-between border-b bg-white px-6 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-200">
            <Bot className="h-5 w-5 text-zinc-600" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              Bot Not Executing Properly
            </h2>
            <p className="text-xs text-zinc-500">
              {ticket.customer} · Plan: {ticket.plan} · SLA : {ticket.sla}
            </p>
          </div>
        </div>
        <button className="text-zinc-400 hover:text-zinc-600">
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        <Conversation messages={messages} />
        {telemetry && <TelemetryOverview data={telemetry} />}
      </div>

      {/* Reply */}
      <ReplyBar />

      {/* Footer */}
      <div className="flex items-center gap-3 border-t bg-white px-4 py-1.5 text-xs text-zinc-400">
        <span className="flex items-center gap-1">
          ✓ <span>Views all</span>
        </span>
        <span className="flex items-center gap-1">📍 ✦ omewave</span>
      </div>
    </div>
  );
}
