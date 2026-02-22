import { useState } from "react";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { Sidebar } from "@/components/sidebar";
import { TicketList } from "@/components/ticket-list";
import { TicketDetail } from "@/components/ticket-detail";
import { AiAssistant } from "@/components/ai-assistant";
import { ClientDirectory } from "@/components/client-directory";
import { ProfileSettings } from "@/components/profile-settings";
import { Loader2 } from "lucide-react";
import { tickets } from "@/data/dummy-data";
import type { AppView } from "@/types";

function AppContent() {
  const { loading } = useAuth();
  const [selectedTicketId, setSelectedTicketId] = useState(tickets[0].id);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<AppView>("inbox");
  const selectedTicket = tickets.find((t) => t.id === selectedTicketId)!;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm">Loading Kairo...</p>
        </div>
      </div>
    );
  }

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
      ) : activeView === "settings" ? (
        <ProfileSettings />
      ) : (
        <ClientDirectory />
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
