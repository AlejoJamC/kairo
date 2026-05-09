import { useState } from "react";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { TopChrome } from "@/components/top-chrome";
import { Sidebar } from "@/components/sidebar";
import { Inbox } from "@/components/inbox";
import { ClientDirectory } from "@/components/client-directory";
import { ProfileSettings } from "@/components/profile-settings";
import { ChangePasswordSettings } from "@/components/change-password-settings";
import { AwaitingCustomerView } from "@/components/awaiting-customer-view";
import type { AppView } from "@/types";

const COMING_SOON_VIEWS: AppView[] = ["panel", "auto-resolved", "guided", "escalated"];

function ComingSoon({ view }: { view: AppView }) {
  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        background: "var(--k-bg)",
      }}
    >
      <p style={{ color: "var(--k-text-tertiary)", fontSize: 13, textTransform: "capitalize" }}>
        {view} — coming soon
      </p>
    </div>
  );
}

function AppContent() {
  const { loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("sidebar-collapsed") === "true"
  );
  const [activeView, setActiveView] = useState<AppView>("inbox");

  const handleToggle = () => {
    setSidebarCollapsed((c) => {
      const next = !c;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          flexDirection: "column",
          gap: 12,
          background: "var(--k-bg)",
        }}
      >
        {/* kairo-spinner defined in index.css — uses --k-accent */}
        <div className="kairo-spinner" />
        <p style={{ color: "var(--k-text-tertiary)", fontSize: 13 }}>Loading Kairo…</p>
      </div>
    );
  }

  const renderView = () => {
    if (activeView === "inbox") return <Inbox />;
    if (activeView === "awaiting") return <AwaitingCustomerView onViewChange={setActiveView} />;
    if (activeView === "settings") return <ProfileSettings onViewChange={setActiveView} />;
    if (activeView === "change-password") return <ChangePasswordSettings onViewChange={setActiveView} />;
    if (activeView === "clients") return <ClientDirectory />;
    if (COMING_SOON_VIEWS.includes(activeView)) return <ComingSoon view={activeView} />;
    return <Inbox />;
  };

  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--k-bg)",
        overflow: "hidden",
      }}
    >
      {/* Top chrome — 56 px: logo/toggle | search | bell + avatar */}
      <TopChrome collapsed={sidebarCollapsed} onToggle={handleToggle} />

      {/* Body — sidebar + main content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={handleToggle}
          activeView={activeView}
          onViewChange={setActiveView}
        />
        <main style={{ flex: 1, overflow: "hidden", display: "flex" }}>
          {renderView()}
        </main>
      </div>
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
