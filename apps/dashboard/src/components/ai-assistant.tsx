import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { getClientProfile } from "@kairo/client-core/endpoints";
import type { ClientProfile } from "@kairo/client-core/stores/triage-store";
import { ClientTabContainer, EscalateTabContainer } from "@/components/triage/ContextTabs";
import { useAppCommands } from "@/lib/app-commands";
import { useResizablePanel } from "@/hooks/use-resizable-panel";
import { AssistantPanel } from "@/components/triage/AssistantPanel";
import { NotesPanel } from "@/components/triage/NotesPanel";
import { INTERNAL_NOTES_ENABLED } from "@/lib/internal-notes-flags";
import { SimilarTab } from "@/components/triage/SimilarTab";
import { ArticlesTab } from "@/components/triage/ArticlesTab";
import { CONTEXT_TAB_ORDER, parseTabOrder, sortTabs, type ContextTabId } from "@/lib/context-tab-order";
import { SUPERPOWERS_ENABLED, NOTES_TAB_ENABLED } from "@/lib/panel-flags";
import { isTicketReadOnly } from "@kairo/client-core/triage-status";
import { tokens } from "@kairo/tokens";
import { Box, Icon, IconButton, Resizer, Tab, Tabs, Tooltip } from "@kairo/ui";
import { useSuperpowersVisibility } from "@/hooks/use-superpowers-visibility";

// The sizes of the neighbours come from the layout tokens, so the panel and the window floor agree.
const RESIZE_MIN = Number.parseFloat(tokens["layout.context"]);
const QUEUE_WIDTH = Number.parseFloat(tokens["layout.queue"]);

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard > Right Panel — Feature Flags (VITE_FF_*)
// ═══════════════════════════════════════════════════════════════════════════
// Each tab can be enabled/disabled via VITE_FF_ENABLE_<TAB_NAME> in .env
// Default: false (disabled) — only renders if explicitly enabled
//
// ═══════════════════════════════════════════════════════════════════════════

export function isFlagEnabled(value: string | undefined): boolean {
  return value === "true";
}

const assistantTabEnabled = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_ASSISTANT_TAB);
const clientTabEnabled    = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_CLIENT_TAB);
const escalateTabEnabled  = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_ESCALATE_TAB);
const similarTabEnabled   = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_SIMILAR_TAB);
const articlesTabEnabled  = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_ARTICLES_TAB);
const tabOrder = parseTabOrder(import.meta.env.VITE_FF_RIGHT_PANEL_TAB_ORDER);

type TabId = ContextTabId;

// ---------------------------------------------------------------------------
// AiAssistant — Right Rail (FIG 2.3)
// Owns the client-profile fetch so it runs regardless of active tab.
// ---------------------------------------------------------------------------

export function AiAssistant() {
  return SUPERPOWERS_ENABLED ? <SuperpowersPanel /> : null;
}

function SuperpowersPanel() {
  const { hidden, show, hidePanel } = useSuperpowersVisibility();
  const { t, i18n } = useTranslation("dashboard");
  const { selectedTicketId, tickets, setClientProfile } = useTriageStore();
  const selectedTicket = tickets.find((tk) => tk.id === selectedTicketId) ?? null;

  // A disabled flag only removes its tab; VITE_FF_RIGHT_PANEL_TAB_ORDER sets the order.
  const tabs = useMemo(
    () => sortTabs<{ id: TabId; label: string; ai?: boolean }>([
      ...(clientTabEnabled ? [{ id: "client" as TabId, label: t("ai.tabClient") }] : []),
      ...(assistantTabEnabled ? [{ id: "assistant" as TabId, label: t("ai.tabAssistant"), ai: true }] : []),
      // KAI-232 — gated by the shared internal-notes flag, not a tab-specific
      // one: the whole internal-notes surface lives or dies together.
      ...(INTERNAL_NOTES_ENABLED && NOTES_TAB_ENABLED ? [{ id: "notes" as TabId, label: t("ai.tabNotes") }] : []),
      ...(escalateTabEnabled ? [{ id: "escalate" as TabId, label: t("ai.tabEscalate") }] : []),
      ...(similarTabEnabled ? [{ id: "similar" as TabId, label: t("ai.tabSimilar") }] : []),
      ...(articlesTabEnabled ? [{ id: "articles" as TabId, label: t("ai.tabArticles") }] : []),
    ], tabOrder),
    [t]
  );
  const defaultTabId: TabId = tabs[0]?.id ?? "assistant";

  const [activeTab,      setActiveTab]      = useState<TabId>(defaultTabId);
  const setContextTab = useAppCommands((state) => state.setContextTab);
  useEffect(() => {
    setContextTab(selectedTicketId ? activeTab : null);
  }, [activeTab, selectedTicketId, setContextTab]);
  const panelTabRequest = useTriageStore((state) => state.panelTabRequest);
  const clearPanelTabRequest = useTriageStore((state) => state.clearPanelTabRequest);
  const [profileLoading, setProfileLoading] = useState(false);

  // KAI-232 — unread mentions on the selected ticket, for the Notes tab badge.
  const noteCounts = useTriageStore((s) => s.noteCounts);
  const requestComposeNote = useTriageStore((s) => s.requestComposeNote);
  const notesBadge = selectedTicketId
    ? (noteCounts[selectedTicketId]?.unread_mentions ?? 0)
    : 0;
  const notesTotal = selectedTicketId ? (noteCounts[selectedTicketId]?.notes ?? 0) : 0;

  // Single fetch owned here — runs on ticket change regardless of active tab.
  // The client tab reads the profile from the store.
  useEffect(() => {
    if (!selectedTicketId) { setClientProfile(null); return; }
    setClientProfile(null);
    setProfileLoading(true);
    getClientProfile(selectedTicketId)
      .then(async (res) => {
        if (!res.ok) return;
        setClientProfile(await res.json() as ClientProfile);
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [selectedTicketId]);

  // E and the notes badge of the ticket bar ask for a specific tab.
  useEffect(() => {
    if (!panelTabRequest) return;
    const requested = panelTabRequest.tab as TabId;
    clearPanelTabRequest();
    show();
    if (tabs.some((entry) => entry.id === requested)) setActiveTab(requested);
  }, [panelTabRequest, clearPanelTabRequest, tabs, show]);

  // Reset to the first tab when ticket changes.
  useEffect(() => { setActiveTab(defaultTabId); }, [selectedTicketId, defaultTabId]);

  // Drag-to-resize. Floor = the current fixed width (340). Ceiling is computed
  // so the center column keeps a usable width; the left rail + ticket list
  // (reserveLeft) are never touched — only the center yields. See the hook.
  const { panelRef, width, max, setWidth, commit, reset } = useResizablePanel({
    min: RESIZE_MIN,   // current fixed design width — the minimum
    cap: 720,          // absolute ceiling (optimal reading/chat line length)
    reserveLeft: QUEUE_WIDTH,  // fixed ticket-list column to the panel's left
    centerMin: 520,    // smallest comfortable width for the email/composer column
  });

  return (
    <Box ref={panelRef} id="superpowers" position="relative" width={width} flexShrink={0} display={hidden ? "none" : "flex"} flexDirection="column" height="100%" borderLeftWidth={1} borderLeftColor="var(--k-border)" borderStyle="solid" backgroundColor="white">

      {/* Resize handle — drag the left edge to widen (steals from center only);
          double-click to reset to the minimum width. */}
      <Box position="absolute" left={0} top={0} bottom={0} zIndex={5} display="flex">
        <Resizer
          label={t("ai.resizeHint")}
          value={width}
          min={RESIZE_MIN}
          max={max}
          invert
          onValueChange={setWidth}
          onCommit={commit}
          onReset={reset}
        />
      </Box>

      {/* Tab bar */}
      <Box paddingTop={12} paddingHorizontal={14} paddingBottom={0} flexShrink={0} display="flex" alignItems="center" gap={8}>
        <Box flexGrow={1} minWidth={0}>
        <Tabs label={t("ai.contextTabs", "Context")}>
          {tabs.map(({ id, label, ai }) => (
            <Tab
              key={id}
              selected={activeTab === id}
              ai={ai}
              shortcut={`⌘${CONTEXT_TAB_ORDER.indexOf(id) + 1}`}
              keyshortcuts={`Meta+${CONTEXT_TAB_ORDER.indexOf(id) + 1}`}
              onPress={() => setActiveTab(id)}
              count={id === "notes" ? (notesBadge > 0 ? notesBadge : notesTotal > 0 ? notesTotal : undefined) : undefined}
              unread={id === "notes" && notesBadge > 0}
            >
              {label}
            </Tab>
          ))}
        </Tabs>
        </Box>
        <Tooltip label={hidePanel.label} shortcut={hidePanel.shortcut}>
          <IconButton label={hidePanel.label} aria-keyshortcuts={hidePanel.keyshortcuts} aria-controls={hidePanel.controls} aria-expanded onPress={hidePanel.onHide}>
            <Icon name="panel" size={15} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Tab content — the Assistant chat owns full height (internal scroll +
          pinned composer); the other tabs use a padded, scrollable container. */}
      {assistantTabEnabled && activeTab === "assistant" ? (
        <Box flexGrow={1} flexShrink={1} flexBasis="0%" minHeight={0} display="flex" flexDirection="column">
          <AssistantPanel />
        </Box>
      ) : (
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" scroll padding={14}>
        {clientTabEnabled && activeTab === "client" && (
          <ClientTabContainer loading={profileLoading} />
        )}
        {escalateTabEnabled && activeTab === "escalate" && (
          selectedTicket && <EscalateTabContainer key={selectedTicket.id} ticket={selectedTicket} readOnly={isTicketReadOnly(selectedTicket.status)} />
        )}
        {INTERNAL_NOTES_ENABLED && NOTES_TAB_ENABLED && activeTab === "notes" && (
          <NotesPanel ticketId={selectedTicketId} onNewNote={requestComposeNote} />
        )}
        {similarTabEnabled && activeTab === "similar" && (
          <SimilarTab ticketId={selectedTicketId} lang={i18n.language} />
        )}
        {articlesTabEnabled && activeTab === "articles" && (
          <ArticlesTab ticketId={selectedTicketId} />
        )}
      </Box>
      )}
    </Box>
  );
}
