import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { Loader2 } from "lucide-react";
import type { GmailTicket } from "@/types";
import { useTranslation } from "react-i18next";

const priorityColors: Record<string, string> = {
  P1: "bg-red-50 text-red-700 border border-red-200",
  P2: "bg-amber-50 text-amber-700 border border-amber-200",
  P3: "bg-gray-100 text-gray-600 border border-gray-300",
};

interface TicketListProps {
  selectedId: string | null;
  onSelect: (ticket: GmailTicket) => void;
  refreshKey?: number;
}

export function TicketList({ selectedId, onSelect, refreshKey }: TicketListProps) {
  const { user } = useAuth();
  const { t } = useTranslation("dashboard");
  const [tickets, setTickets] = useState<GmailTicket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchTickets();
    }
  }, [user, refreshKey]);

  const fetchTickets = async () => {
    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from("tickets")
      .select("*")
      .eq("user_id", user!.id)
      .order("received_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Failed to fetch tickets:", error);
    } else {
      setTickets((data as GmailTicket[]) || []);
      // Auto-select first ticket if none selected
      if (data && data.length > 0 && !selectedId) {
        onSelect(data[0] as GmailTicket);
      }
    }

    setLoading(false);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">{t("tickets.title")}</h2>
        <span className="text-xs text-zinc-500">{tickets.length}</span>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <p className="text-sm text-zinc-500">No tickets yet.</p>
          <p className="text-xs text-zinc-400">
            Click "Sync Gmail" to import emails.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => onSelect(ticket)}
              className={`flex w-full flex-col border-b px-4 py-3 text-left transition-colors duration-150 ${
                selectedId === ticket.id ? "bg-zinc-50" : "hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="truncate text-sm font-medium text-zinc-900">
                  {ticket.from_name || ticket.from_email}
                </span>
                {ticket.priority && (
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      priorityColors[ticket.priority] ?? "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {ticket.priority}
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-zinc-700">{ticket.subject}</p>
              <p className="mt-1 line-clamp-2 text-xs text-zinc-500">
                {ticket.snippet}
              </p>
              <p className="mt-1 text-[10px] text-zinc-400">
                {new Date(ticket.received_at).toLocaleString()}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
