import { Badge } from "@/components/ui/badge";
import type { Ticket } from "@/types";
import { tickets } from "@/data/dummy-data";
import { useTranslation } from "react-i18next";

const priorityColors: Record<string, string> = {
  P1: "bg-red-50 text-red-700 border border-red-200 hover:bg-red-50",
  P2: "bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50",
  P3: "bg-gray-100 text-gray-600 border border-gray-300 hover:bg-gray-100",
};

interface TicketListProps {
  selectedId: string;
  onSelect: (id: string) => void;
}

export function TicketList({ selectedId, onSelect }: TicketListProps) {
  const { t } = useTranslation("dashboard");

  return (
    <div className="flex h-screen w-[300px] flex-col border-r bg-white transition-all duration-150">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">{t("tickets.title")}</h2>
        <span className="text-xs text-zinc-500">448</span>
      </div>

      <div className="flex gap-1 border-b px-4 py-2">
        <button className="rounded-md bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">
          All
        </button>
        <button className="rounded-md px-2.5 py-1 text-xs text-zinc-500 hover:bg-zinc-50">
          Auto Resolvable (14)
        </button>
        <span className="ml-auto rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-500">
          3
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {tickets.map((ticket: Ticket) => (
          <button
            key={ticket.id}
            onClick={() => onSelect(ticket.id)}
            className={`flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors duration-150 ${
              selectedId === ticket.id
                ? "bg-zinc-50"
                : "hover:bg-gray-50"
            }`}
          >
            <Badge
              className={`${priorityColors[ticket.priority]} text-[10px] font-semibold px-1.5 py-0.5 rounded`}
            >
              {ticket.priority}
            </Badge>
            <div className="flex-1 min-w-0">
              <span className="block truncate text-sm text-zinc-900">
                {ticket.priority} {ticket.title}
              </span>
            </div>
            <Badge variant="outline" className="text-[10px] shrink-0">
              {ticket.channel}
            </Badge>
          </button>
        ))}
      </div>
    </div>
  );
}
