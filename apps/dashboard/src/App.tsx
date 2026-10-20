import { useState } from "react";
import { Navigate } from "react-router";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "@kairo/client-core/auth";
import { getPlatform } from "@kairo/client-core/config";
import { useSidebarCounts } from "@kairo/client-core/hooks/use-sidebar-counts";
import { SIDEBAR_COUNTS_POLL_INTERVAL_SECONDS } from "@/lib/poll-intervals";
import { AppStatusBar } from "@/components/app-status-bar";
import { Sidebar } from "@/components/sidebar";
import { Inbox } from "@/components/inbox";
import { ClientDirectory } from "@/components/client-directory";
import { ProfileSettings } from "@/components/profile-settings";
import { ChangePasswordSettings } from "@/components/change-password-settings";
import { AwaitingCustomerView } from "@/components/awaiting-customer-view";
import { ResolvedView } from "@/components/resolved-view";
import { EscalatedView } from "@/components/escalated-view";
import { AiReviewView } from "@/components/ai-review-view";
import { KnowledgeView } from "@/components/knowledge-view";
import { ChannelsSettings } from "@/components/channels-settings";
import type { AppView } from "@/types";
import { useActiveView } from "@/hooks/useActiveView";
import { pathForView } from "@/routes";
import { Box, Spinner, Text } from "@kairo/ui";

const COMING_SOON_VIEWS: AppView[] = ["in-progress"];

function ComingSoon({ view }: { view: AppView }) {
  const { t } = useTranslation(["dashboard"]);
  const titleKey =
    view === "in-progress" ? "dashboard:sidebar.inProgress" :
    view === "resolved" ? "dashboard:sidebar.resolved" :
    "dashboard:sidebar.escalation";
  return (
    <Box display="flex" flexGrow={1} flexShrink={1} flexBasis="0%" flexDirection="column" alignItems="center" justifyContent="center" gap={8} backgroundColor="var(--k-bg)">
      <Text tag="p" color="var(--k-text-primary)" fontSize={15} fontWeight={600} display="block">
        {t(titleKey)}
      </Text>
      <Text tag="p" color="var(--k-text-tertiary)" fontSize={13} display="block">
        {t("dashboard:settings.comingSoon")}
      </Text>
    </Box>
  );
}

function AppContent() {
  const { loading } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => getPlatform().storage.getItem("sidebar-collapsed") === "true"
  );
  const [routedView, setActiveView] = useActiveView();
  const counts = useSidebarCounts(SIDEBAR_COUNTS_POLL_INTERVAL_SECONDS);

  const handleToggle = () => {
    setSidebarCollapsed((c) => {
      const next = !c;
      getPlatform().storage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  if (routedView === null) return <Navigate to={pathForView("triage")} replace />;
  const activeView = routedView;

  if (loading) {
    return (
      <Box display="flex" alignItems="center" justifyContent="center" height="100vh" flexDirection="column" gap={12} backgroundColor="var(--k-bg)">
        <Spinner size="lg" />
        <Text tag="p" color="var(--k-text-tertiary)" fontSize={13} display="block">Loading Kairo…</Text>
      </Box>
    );
  }

  const renderView = () => {
    if (activeView === "triage") return <Inbox />;
    if (activeView === "awaiting") return <AwaitingCustomerView onViewChange={setActiveView} />;
    if (activeView === "resolved") return <ResolvedView onViewChange={setActiveView} />;
    if (activeView === "escalated") return <EscalatedView onViewChange={setActiveView} />;
    if (activeView === "ai-review") return <AiReviewView onViewChange={setActiveView} />;
    if (activeView === "knowledge") return <KnowledgeView onViewChange={setActiveView} />;
    if (activeView === "settings") return <ProfileSettings onViewChange={setActiveView} />;
    if (activeView === "change-password") return <ChangePasswordSettings onViewChange={setActiveView} />;
    if (activeView === "channels") return <ChannelsSettings onViewChange={setActiveView} />;
    if (activeView === "clients") return <ClientDirectory />;
    if (COMING_SOON_VIEWS.includes(activeView)) return <ComingSoon view={activeView} />;
    return <Inbox />;
  };

  return (
    <Box height="100vh" display="flex" flexDirection="column" backgroundColor="var(--k-bg)" overflow="hidden">
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" overflow="hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={handleToggle}
          activeView={activeView}
          onViewChange={setActiveView}
          counts={counts}
        />
        {/* overflowX: auto (not hidden) so the combined min-widths of the ticket
            list (360px fixed), center panel (520px min — see ticket-detail.tsx),
            and right panel (340px floor — see use-resizable-panel.ts) become a
            real supported minimum: below that sum the row scrolls horizontally
            instead of clipping/squishing the center column. */}
        <Box tag="main" flexGrow={1} flexShrink={1} flexBasis="0%" overflowY="hidden" overflowX="auto" display="flex">
          {renderView()}
        </Box>
      </Box>

      <AppStatusBar counts={counts} />
    </Box>
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
