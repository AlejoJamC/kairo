import type { Ticket } from "@/types";
import { conversationsByTicket, telemetryByTicket } from "@/data/dummy-data";
import { Conversation } from "./conversation";
import { TelemetryOverview } from "./telemetry-overview";
import { ReplyBar } from "./reply-bar";
import { Bot, Clock } from "lucide-react";

interface TicketDetailProps {
  ticket: Ticket;
}

export function TicketDetail({ ticket }: TicketDetailProps) {
  const messages = conversationsByTicket[ticket.id] ?? [];
  const telemetry = telemetryByTicket[ticket.id];

  return (
    <div className="flex flex-1 flex-col bg-zinc-50">
      {/* Fixed Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-200">
            <Bot className="h-5 w-5 text-zinc-600" />
          </div>
          <h2 className="text-base font-semibold text-zinc-900">
            Bot Not Executing Properly
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
            Customer: {ticket.customer}
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
            Plan: {ticket.plan}
          </span>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
            SLA: {ticket.sla}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 border border-amber-200">
            <Clock className="h-3 w-3" />
            Elapsed: 2h 15m
          </span>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        <Conversation messages={messages} />
        {telemetry && <TelemetryOverview data={telemetry} />}
      </div>

      {/* Fixed bottom reply bar */}
      <ReplyBar />
    </div>
  );
}
