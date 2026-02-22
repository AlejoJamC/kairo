import { useState } from "react";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { Sidebar } from "@/components/sidebar";
import { TicketList } from "@/components/ticket-list";
import { TicketDetail } from "@/components/ticket-detail";
import { AiAssistant } from "@/components/ai-assistant";
import { ClientDirectory } from "@/components/client-directory";
import { ProfileSettings } from "@/components/profile-settings";
import { SyncButton } from "@/components/sync-button";
import { Loader2 } from "lucide-react";
import type { AppView, GmailTicket } from "@/types";

function AppContent() {
  const { loading } = useAuth();
  const [selectedTicket, setSelectedTicket] = useState<GmailTicket | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeView, setActiveView] = useState<AppView>("inbox");
  const [refreshKey, setRefreshKey] = useState(0);

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
          <div className="flex h-screen w-[300px] flex-col border-r bg-white">
            <SyncButton onSyncComplete={() => setRefreshKey((k) => k + 1)} />
            <TicketList
              selectedId={selectedTicket?.id ?? null}
              onSelect={setSelectedTicket}
              refreshKey={refreshKey}
            />
          </div>
          <TicketDetail ticket={selectedTicket} />
          <AiAssistant
            customer={
              selectedTicket?.from_name ||
              selectedTicket?.from_email ||
              "—"
            }
          />
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
