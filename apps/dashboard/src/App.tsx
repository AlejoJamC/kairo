import { useState } from "react";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { Sidebar } from "@/components/sidebar";
import { Inbox } from "@/components/inbox";
import { ClientDirectory } from "@/components/client-directory";
import { ProfileSettings } from "@/components/profile-settings";
import { ChangePasswordSettings } from "@/components/change-password-settings";
import { Loader2 } from "lucide-react";
import type { AppView } from "@/types";

const COMING_SOON_VIEWS: AppView[] = ["panel", "awaiting", "auto-resolved", "guided", "escalated"];

function ComingSoon({ view }: { view: AppView }) {
  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-950">
      <p className="text-zinc-500 text-sm capitalize">{view} — coming soon</p>
    </div>
  );
}

function AppContent() {
  const { loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true"
  );
  const [activeView, setActiveView] = useState<AppView>("inbox");

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

  const renderView = () => {
    if (activeView === "inbox") return <Inbox />;
    if (activeView === "settings") return <ProfileSettings onViewChange={setActiveView} />;
    if (activeView === "change-password") return <ChangePasswordSettings onViewChange={setActiveView} />;
    if (activeView === "clients") return <ClientDirectory />;
    if (COMING_SOON_VIEWS.includes(activeView)) return <ComingSoon view={activeView} />;
    return <Inbox />;
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => {
          const next = !c;
          localStorage.setItem("sidebar-collapsed", String(next));
          return next;
        })}
        activeView={activeView}
        onViewChange={setActiveView}
      />
      {renderView()}
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
