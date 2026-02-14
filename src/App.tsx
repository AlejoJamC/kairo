import { useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { TicketList } from "@/components/ticket-list";
import { TicketDetail } from "@/components/ticket-detail";
import { AiAssistant } from "@/components/ai-assistant";
import { tickets } from "@/data/dummy-data";

function App() {
  const [selectedTicketId, setSelectedTicketId] = useState(tickets[0].id);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const selectedTicket = tickets.find((t) => t.id === selectedTicketId)!;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />
      <TicketList
        selectedId={selectedTicketId}
        onSelect={setSelectedTicketId}
        collapsed={sidebarCollapsed}
      />
      <TicketDetail ticket={selectedTicket} />
      <AiAssistant customer={selectedTicket.customer} />
    </div>
  );
}

export default App;
