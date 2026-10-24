import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { getRelatedHistory, getKnowledgeContext, getClientProfile } from "@kairo/client-core/endpoints";
import type { ClientProfile } from "@kairo/client-core/stores/triage-store";
import { ClientTabContainer, EscalateTabContainer } from "@/components/triage/ContextTabs";
import { useResizablePanel } from "@/hooks/use-resizable-panel";
import { AssistantPanel } from "@/components/triage/AssistantPanel";
import { NotesPanel } from "@/components/triage/NotesPanel";
import { INTERNAL_NOTES_ENABLED } from "@/lib/internal-notes-flags";
import { isTicketReadOnly } from "@kairo/client-core/triage-status";
import { tokens } from "@kairo/tokens";
import { Box, Button, Chip, Icon, Resizer, Skeleton, Tab, Tabs, Text } from "@kairo/ui";

// The sizes of the neighbours come from the layout tokens, so the panel and the window floor agree.
const RESIZE_MIN = Number.parseFloat(tokens["layout.context"]);
const QUEUE_WIDTH = Number.parseFloat(tokens["layout.queue"]);

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard > Right Panel — Feature Flags (VITE_FF_*)
// ═══════════════════════════════════════════════════════════════════════════
// Each tab can be enabled/disabled via VITE_FF_ENABLE_<TAB_NAME> in .env
// Default: false (disabled) — only renders if explicitly enabled
//
// Order: VITE_FF_RIGHT_PANEL_TAB_ORDER="client,escalate,assistant" (optional,
// comma-separated tab ids). Purely additive — does not touch the enable/
// disable flags above. Unset → order stays exactly as coded below (today's
// behavior). Any enabled tab not named in the list is appended at the end,
// in the order it appears below.
// ═══════════════════════════════════════════════════════════════════════════

export function isFlagEnabled(value: string | undefined): boolean {
  return value === "true";
}

const assistantTabEnabled = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_ASSISTANT_TAB);
const clientTabEnabled    = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_CLIENT_TAB);
const similarTabEnabled   = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_SIMILAR_TAB);
const articlesTabEnabled  = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_ARTICLES_TAB);
const escalateTabEnabled  = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_ESCALATE_TAB);

const tabOrder: string[] = (import.meta.env.VITE_FF_RIGHT_PANEL_TAB_ORDER ?? "")
  .split(",")
  .map((id: string) => id.trim())
  .filter(Boolean);

/** Sorts enabled tabs by tabOrder; unlisted tabs keep their relative (coded) order at the end. */
function sortByTabOrder<T extends { id: string }>(tabs: T[]): T[] {
  if (tabOrder.length === 0) return tabs;
  return [...tabs].sort((a, b) => {
    const ia = tabOrder.indexOf(a.id);
    const ib = tabOrder.indexOf(b.id);
    if (ia === -1 && ib === -1) return 0; // preserve relative order (stable sort)
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SimilarCase {
  id:                 string;
  subject:            string | null;
  resolved_at:        string | null;
  resolution_summary: string | null;
  ticket_number:      number;
  similarity:         number | null;
}

interface KbArticle {
  id:         string;
  title:      string;
  content:    string;
  tags:       string[] | null;
  similarity: number | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null, lang: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(lang === "en" ? "en-US" : "es-CO", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatSim(s: number | null): string | null {
  return s === null ? null : `${Math.round(s * 100)}%`;
}

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

const TAB_IDS = ["assistant", "client", "similar", "articles", "escalate", "notes"] as const;
type TabId = typeof TAB_IDS[number];

// ---------------------------------------------------------------------------
// SimilarTab
// ---------------------------------------------------------------------------

function SimilarTab({ ticketId, lang }: { ticketId: string | null; lang: string }) {
  const { t } = useTranslation("dashboard");
  const setSuggestedReply = useTriageStore((s) => s.setSuggestedReply);

  const [cases,        setCases]        = useState<SimilarCase[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

  useEffect(() => {
    if (!ticketId) { setCases([]); setExpandedCase(null); return; }
    setCases([]); setExpandedCase(null); setLoading(true);
    getRelatedHistory(ticketId)
      .then(async (res) => {
        if (!res.ok) return;
        const json: { data: SimilarCase[] } = await res.json();
        setCases((json.data ?? []).slice(0, 3));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticketId]);

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" gap={8}>
        <Skeleton height={80} borderRadius={8} />
        <Skeleton height={80} borderRadius={8} />
      </Box>
    );
  }

  if (cases.length === 0) {
    return (
      <Text tag="p" fontSize={12} color="var(--k-text-tertiary)" fontStyle="italic" margin={0} display="block">
        {t("ai.noSimilarCases")}
      </Text>
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap={8}>
      <Text tag="p" fontSize={11} color="var(--k-text-tertiary)" font="mono" marginTop={0} marginHorizontal={0} marginBottom={4} display="block">
        {cases.length} {t("ai.resolvedCases")}
      </Text>
      {cases.map((c) => (
        <Box key={c.id} padding={12} borderWidth={1} borderColor="var(--k-border)" borderRadius={8} display="flex" flexDirection="column" gap={4} borderStyle="solid">
          <Box display="flex" alignItems="center" justifyContent="space-between" gap={8}>
            <Text font="mono" fontSize={11} color="var(--k-text-tertiary)">
              {t("ai.ticketNumber", { number: c.ticket_number })}
            </Text>
            {formatSim(c.similarity) && (
              <Text font="mono" fontSize={11} color="var(--kairo-color-ok)" flexShrink={0}>
                {formatSim(c.similarity)} sim
              </Text>
            )}
          </Box>
          {c.subject && (
            <Text tag="p" fontSize={13} fontWeight={500} color="var(--k-text-primary)" lineHeight={17.55} margin={0} display="block">
              {c.subject}
            </Text>
          )}
          {c.resolved_at && (
            <Text tag="p" fontSize={11} font="mono" color="var(--k-text-tertiary)" margin={0} display="block">
              {t("ai.resolvedOn")} {formatDate(c.resolved_at, lang)}
            </Text>
          )}
          {c.resolution_summary && (
            <>
              <Button variant="link" size="sm" iconEnd={<Icon name="right" size={11} color="var(--kairo-color-accent-ink)" />} onPress={() => setExpandedCase((p) => (p === c.id ? null : c.id))}>
                {expandedCase === c.id ? t("ai.hideResolution") : t("ai.viewResolution")}
              </Button>
              {expandedCase === c.id && (
                <>
                  <Text tag="p" marginTop={4} borderRadius={6} backgroundColor="var(--k-surface)" paddingVertical={8} paddingHorizontal={10} fontSize={12} lineHeight={18.6} color="var(--k-text-secondary)" display="block">
                    {c.resolution_summary}
                  </Text>
                  <Button variant="link" size="sm" icon={<Icon name="note" size={12} color="var(--kairo-color-accent-ink)" />} onPress={() => setSuggestedReply(c.resolution_summary!)}>
                    {t("ai.useInReply")}
                  </Button>
                </>
              )}
            </>
          )}
        </Box>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// ArticlesTab (previously "KB")
// ---------------------------------------------------------------------------

function ArticlesTab({ ticketId }: { ticketId: string | null }) {
  const { t } = useTranslation("dashboard");
  const setSuggestedReply = useTriageStore((s) => s.setSuggestedReply);

  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (!ticketId) { setArticles([]); return; }
    setArticles([]); setLoading(true);
    getKnowledgeContext(ticketId)
      .then(async (res) => {
        if (!res.ok) return;
        const json: { kbArticles: KbArticle[] } = await res.json();
        setArticles(json.kbArticles ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ticketId]);

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" gap={8}>
        <Skeleton height={72} borderRadius={8} />
        <Skeleton height={72} borderRadius={8} />
      </Box>
    );
  }

  if (!ticketId || articles.length === 0) {
    return (
      <Text tag="p" fontSize={12} color="var(--k-text-tertiary)" fontStyle="italic" margin={0} display="block">
        {t("ai.noKbArticles")}
      </Text>
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap={6}>
      {articles.map((article) => (
        <Box key={article.id} borderRadius={8} borderWidth={1} borderColor="var(--k-border)" borderLeftWidth={3} borderLeftColor="var(--k-accent)" paddingTop={10} paddingRight={10} paddingBottom={10} paddingLeft={12} display="flex" flexDirection="column" gap={6} borderStyle="solid">
          <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={8}>
            <Text fontSize={13} fontWeight={500} color="var(--k-text-primary)" lineHeight={17.55} display="flex" alignItems="center" gap={6}>
              <Icon name="knowledge" size={13} color="var(--k-text-tertiary)" />
              {article.title}
            </Text>
            {formatSim(article.similarity) && (
              <Text flexShrink={0} fontSize={10} font="mono" paddingVertical={2} paddingHorizontal={6} borderRadius={4} backgroundColor="var(--k-accent-subtle)" color="var(--k-accent)">
                {formatSim(article.similarity)}
              </Text>
            )}
          </Box>
          {article.tags && article.tags.length > 0 && (
            <Box display="flex" flexWrap="wrap" gap={4}>
              {article.tags.map((tag) => (
                <Chip key={tag} size="sm">{tag}</Chip>
              ))}
            </Box>
          )}
          <Button variant="link" size="sm" icon={<Icon name="note" size={12} color="var(--kairo-color-accent-ink)" />} onPress={() => setSuggestedReply(article.content)}>
            {t("ai.useInReply")}
          </Button>
        </Box>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// AiAssistant — Right Rail (FIG 2.3)
// Owns the client-profile fetch so it runs regardless of active tab.
// ---------------------------------------------------------------------------

export function AiAssistant() {
  const { t, i18n } = useTranslation("dashboard");
  const { selectedTicketId, tickets, setClientProfile } = useTriageStore();
  const selectedTicket = tickets.find((tk) => tk.id === selectedTicketId) ?? null;

  // KAI — the default/active tab must follow whatever VITE_FF_RIGHT_PANEL_TAB_ORDER
  // put first, not a hardcoded "assistant". Memoized so its reference is stable
  // across renders (only recomputes if the translation function changes, e.g.
  // language switch) — the effect below depends on it and must not fire on
  // every render.
  const tabs = useMemo(
    () =>
      sortByTabOrder<{ id: TabId; label: string; disabled?: boolean; ai?: boolean }>([
        ...(clientTabEnabled ? [{ id: "client" as const, label: t("ai.tabClient") }] : []),
        ...(assistantTabEnabled ? [{ id: "assistant" as const, label: t("ai.tabAssistant"), ai: true }] : []),
        // KAI-232 — gated by the shared internal-notes flag, not a tab-specific
        // one: the whole internal-notes surface lives or dies together.
        ...(INTERNAL_NOTES_ENABLED ? [{ id: "notes" as const, label: t("ai.tabNotes") }] : []),
        ...(escalateTabEnabled ? [{ id: "escalate" as const, label: t("ai.tabEscalate") }] : []),
        ...(similarTabEnabled ? [{ id: "similar" as const, label: t("ai.tabSimilar") }] : []),
        ...(articlesTabEnabled ? [{ id: "articles" as const, label: t("ai.tabArticles") }] : []),
      ]),
    [t]
  );
  const defaultTabId: TabId = tabs[0]?.id ?? "assistant";

  const [activeTab,      setActiveTab]      = useState<TabId>(defaultTabId);
  const panelTabRequest = useTriageStore((state) => state.panelTabRequest);
  const clearPanelTabRequest = useTriageStore((state) => state.clearPanelTabRequest);
  const [profileLoading, setProfileLoading] = useState(false);

  // KAI-232 — unread mentions on the selected ticket, for the Notes tab badge.
  const noteCounts = useTriageStore((s) => s.noteCounts);
  const requestComposeNote = useTriageStore((s) => s.requestComposeNote);
  const notesBadge = selectedTicketId
    ? (noteCounts[selectedTicketId]?.unread_mentions ?? 0)
    : 0;

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
    if (tabs.some((entry) => entry.id === requested)) setActiveTab(requested);
  }, [panelTabRequest, clearPanelTabRequest, tabs]);

  // 1–9 jump to the tab in that position of the strip while a ticket is open.
  useEffect(() => {
    if (!selectedTicketId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const entry = /^[1-9]$/.test(event.key) ? tabs[Number(event.key) - 1] : undefined;
      if (!entry || entry.disabled) return;
      event.preventDefault();
      setActiveTab(entry.id);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedTicketId, tabs]);

  // Reset to the first tab (per VITE_FF_RIGHT_PANEL_TAB_ORDER) when ticket changes.
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
    <Box ref={panelRef} position="relative" width={width} flexShrink={0} display="flex" flexDirection="column" height="100%" borderLeftWidth={1} borderLeftColor="var(--k-border)" borderStyle="solid" backgroundColor="white">

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
      <Box paddingTop={12} paddingHorizontal={14} paddingBottom={0} flexShrink={0}>
        <Tabs label={t("ai.contextTabs", "Context")}>
          {tabs.map(({ id, label, disabled }) => (
            <Tab
              key={id}
              selected={activeTab === id}
              disabled={disabled}
              onPress={() => setActiveTab(id)}
              count={id === "notes" && notesBadge > 0 ? notesBadge : undefined}
              unread
            >
              {label}
            </Tab>
          ))}
        </Tabs>
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
        {similarTabEnabled && activeTab === "similar" && (
          <SimilarTab ticketId={selectedTicketId} lang={i18n.language} />
        )}
        {articlesTabEnabled && activeTab === "articles" && (
          <ArticlesTab ticketId={selectedTicketId} />
        )}
        {escalateTabEnabled && activeTab === "escalate" && (
          selectedTicket && <EscalateTabContainer key={selectedTicket.id} ticket={selectedTicket} readOnly={isTicketReadOnly(selectedTicket.status)} />
        )}
        {INTERNAL_NOTES_ENABLED && activeTab === "notes" && (
          <NotesPanel ticketId={selectedTicketId} onNewNote={requestComposeNote} />
        )}
      </Box>
      )}
    </Box>
  );
}
