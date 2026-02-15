import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { TicketList } from "@/components/ticket-list";
import { TicketDetail } from "@/components/ticket-detail";
import { AiAssistant } from "@/components/ai-assistant";
import { ClientDirectory } from "@/components/client-directory";
import { tickets } from "@/data/dummy-data";
import type { AppView } from "@/types";

function App() {
  const [selectedTicketId, setSelectedTicketId] = useState(tickets[0].id);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<AppView>("inbox");
  const selectedTicket = tickets.find((t) => t.id === selectedTicketId)!;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        activeView={activeView}
        onViewChange={setActiveView}
      />
      {activeView === "inbox" ? (
        <>
          <TicketList
            selectedId={selectedTicketId}
            onSelect={setSelectedTicketId}
          />
          <TicketDetail ticket={selectedTicket} />
          <AiAssistant customer={selectedTicket.customer} />
        </>
      ) : (
        <ClientDirectory />
      )}
    </div>
  );
}

export default App;
