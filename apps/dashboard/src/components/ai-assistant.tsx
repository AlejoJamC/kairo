import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { getRelatedHistory, getKnowledgeContext, requestEscalationReasons, escalateTicket, getClientProfile } from "@kairo/client-core/endpoints";
import type { ClientProfile } from "@kairo/client-core/stores/triage-store";
import {
  ClientProfileCard,
  ClientProfileSkeleton,
} from "@/components/triage/ClientProfileCard";
import { useResizablePanel } from "@/hooks/use-resizable-panel";
import { AssistantPanel } from "@/components/triage/AssistantPanel";
import { NotesPanel } from "@/components/triage/NotesPanel";
import { INTERNAL_NOTES_ENABLED } from "@/lib/internal-notes-flags";
import { Box, Button, Field, FieldTextarea, Icon, Pressable, Resizer, Skeleton, Tab, Tabs, Text } from "@kairo/ui";

const RESIZE_MIN = 340;

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

interface EscalationReason {
  id:       string;
  label_es: string;
  label_en: string;
  severity: "high" | "medium" | "low";
}

interface EscalationResult {
  reasons:          EscalationReason[];
  recommendedLevel: 1 | 2 | 3;
  confidence:       number;
}

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
// Severity styles (inline — no Tailwind palette classes)
// ---------------------------------------------------------------------------

const SEVERITY_CHIP: Record<string, { bg: string; color: string; border: string }> = {
  high:   { bg: "var(--kairo-color-bad-soft)", color: "var(--kairo-color-bad-ink)", border: "var(--kairo-color-bad-line)" },
  medium: { bg: "color-mix(in srgb, var(--kairo-color-mood) 12%, transparent)", color: "var(--kairo-color-sla-escalate-ink)", border: "color-mix(in srgb, var(--kairo-color-mood) 24%, transparent)" },
  low:    { bg: "var(--kairo-color-note-soft)", color: "var(--kairo-color-note)", border: "var(--kairo-color-note-line)" },
};

const SEVERITY_BORDER: Record<string, string> = {
  high: "var(--kairo-color-bad)", medium: "var(--kairo-color-mood)", low: "var(--kairo-color-warn)", none: "var(--k-border)",
};

function topSeverity(reasons: EscalationReason[]): string {
  if (reasons.some((r) => r.severity === "high"))   return "high";
  if (reasons.some((r) => r.severity === "medium")) return "medium";
  if (reasons.some((r) => r.severity === "low"))    return "low";
  return "none";
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
// ClientTab — uses ClientProfileCard (pure display) + adds KPI grid
// ---------------------------------------------------------------------------

function ClientTab({ loading }: { loading: boolean }) {
  const { t, i18n } = useTranslation("dashboard");
  const clientProfile = useTriageStore((s) => s.clientProfile);

  if (loading) {
    return (
      <Box display="flex" flexDirection="column" gap={14}>
        <ClientProfileSkeleton />
        <Skeleton height={112} borderRadius={8} />
        <Box display="flex" flexDirection="column" gap={8}>
          <Skeleton height={9} width={100} />
          <Skeleton height={9} width="90%" />
          <Skeleton height={9} width="80%" />
        </Box>
      </Box>
    );
  }

  const PLAN_STYLE: Record<string, { bg: string; color: string; border: string }> = {
    enterprise: { bg: "#F3F0FF", color: "#6D28D9", border: "#DDD6FE" },
    pro:        { bg: "var(--kairo-color-accent-soft)", color: "var(--kairo-color-accent)", border: "var(--kairo-color-accent-line)" },
    starter:    { bg: "color-mix(in srgb, var(--kairo-color-ok) 8%, transparent)", color: "var(--kairo-color-ok-ink)", border: "color-mix(in srgb, var(--kairo-color-ok) 24%, transparent)" },
    unknown:    { bg: "var(--k-surface-2)", color: "var(--k-text-tertiary)", border: "var(--k-border)" },
  };

  const ticketsTooltip = clientProfile
    ? t("ai.kpiTicketsTooltip", { total: clientProfile.totalTickets, month: clientProfile.ticketsLast30Days })
    : undefined;

  const kpis: { label: string; value: string; isBadge?: boolean; tooltip?: string; accent?: boolean }[] = [
    { label: t("ai.kpiPlan"),    value: clientProfile?.clientType ?? "unknown", isBadge: true },
    { label: t("ai.kpiMrr"),     value: "—" },
    { label: t("ai.kpiSince"),   value: clientProfile?.clientSince
        ? new Date(clientProfile.clientSince).toLocaleDateString(i18n.language === "en" ? "en-US" : "es-ES", { month: "short", year: "numeric" })
        : "—" },
    { label: t("ai.kpiTickets"), value: clientProfile ? String(clientProfile.totalTickets) : "—", accent: true, tooltip: ticketsTooltip },
    { label: t("ai.kpiCsat"),    value: "—" },
    { label: t("ai.kpiNps"),     value: "—" },
  ];

  return (
    <Box display="flex" flexDirection="column" gap={14}>
      <ClientProfileCard />

      {/* KPI grid */}
      {clientProfile && (
        <Box grid gridTemplateColumns="1fr 1fr" gap={1} backgroundColor="var(--k-border-subtle)" borderWidth={1} borderColor="var(--k-border)" borderRadius={8} overflow="hidden" borderStyle="solid">
          {kpis.map((kpi) => {
            const planStyle = PLAN_STYLE[kpi.value] ?? PLAN_STYLE.unknown;
            return (
              <Box key={kpi.label} backgroundColor="white" padding={10}>
                <Text tag="div" fontSize={10} font="mono" color="var(--k-text-tertiary)" textTransform="uppercase" letterSpacing={0.5} display="block">
                  {kpi.label}
                </Text>
                {kpi.isBadge ? (
                  <Text display="inline-flex" alignItems="center" borderRadius={999} marginTop={4} paddingVertical={2} paddingHorizontal={8} fontSize={10} fontWeight={600} textTransform="uppercase" letterSpacing={0.4} backgroundColor={planStyle.bg} color={planStyle.color} borderWidth={1} borderColor={planStyle.border} borderStyle="solid">
                    {kpi.value}
                  </Text>
                ) : (
                  <Text tag="div" title={kpi.tooltip} fontSize={14} fontWeight={500} marginTop={2} color={kpi.accent ? "var(--k-accent)" : "var(--k-text-primary)"} cursor={kpi.tooltip ? "default" : undefined} display="block">
                    {kpi.value}
                  </Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Last interactions */}
      {clientProfile && clientProfile.recentTickets.length > 0 && (
        <div>
          <Text tag="p" fontSize={10} font="mono" color="var(--k-text-tertiary)" textTransform="uppercase" letterSpacing={0.5} marginTop={0} marginHorizontal={0} marginBottom={8} display="block">
            {t("ai.lastInteractions")}
          </Text>
          {clientProfile.recentTickets.slice(0, 3).map((rt, i) => {
            const dateStr = rt.resolved_at ?? rt.created_at;
            const label = dateStr
              ? new Date(dateStr).toLocaleDateString(i18n.language === "en" ? "en-US" : "es-ES", { day: "2-digit", month: "short" })
              : "—";
            return (
              <Text tag="div" key={rt.id} display="flex" gap={10} paddingVertical={8} paddingHorizontal={0} fontSize={12} borderTopWidth={i > 0 ? 1 : 0} borderTopColor="var(--k-border-subtle)" borderStyle="solid">
                <Text font="mono" color="var(--k-text-tertiary)" width={44} flexShrink={0}>
                  {label}
                </Text>
                <Text color="var(--k-text-secondary)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" flexGrow={1} flexShrink={1} flexBasis="0%">
                  {rt.subject ?? "—"}
                </Text>
              </Text>
            );
          })}
        </div>
      )}
    </Box>
  );
}

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
              <Pressable onClick={() => setExpandedCase((p) => (p === c.id ? null : c.id))} fontSize={11} fontWeight={500} color="var(--k-accent)" backgroundColor="transparent" borderWidth={0} cursor="pointer" padding={0} textAlign="left">
                {expandedCase === c.id ? t("ai.hideResolution") : t("ai.viewResolution")} →
              </Pressable>
              {expandedCase === c.id && (
                <>
                  <Text tag="p" marginTop={4} borderRadius={6} backgroundColor="var(--k-surface)" paddingVertical={8} paddingHorizontal={10} fontSize={12} lineHeight={18.6} color="var(--k-text-secondary)" display="block">
                    {c.resolution_summary}
                  </Text>
                  <Pressable onClick={() => setSuggestedReply(c.resolution_summary!)} fontSize={11} color="var(--k-accent)" fontWeight={500} backgroundColor="transparent" borderWidth={0} cursor="pointer" padding={0} textAlign="left" display="flex" alignItems="center" gap={4}>
                    <Icon name="note" size={12} />
                    {t("ai.useInReply")}
                  </Pressable>
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
                <Text key={tag} fontSize={10} paddingVertical={2} paddingHorizontal={6} borderRadius={999} backgroundColor="var(--k-surface-2)" color="var(--k-text-tertiary)">
                  {tag}
                </Text>
              ))}
            </Box>
          )}
          <Pressable onClick={() => setSuggestedReply(article.content)} display="flex" alignItems="center" gap={4} fontSize={11} fontWeight={500} color="var(--k-accent)" backgroundColor="transparent" borderWidth={0} cursor="pointer" padding={0}>
            <Icon name="note" size={12} />
            {t("ai.useInReply")}
          </Pressable>
        </Box>
      ))}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// EscalateTab
// ---------------------------------------------------------------------------

function EscalateTab({
  ticketId,
  customer,
  selectedTicketStatus,
  selectedTicketCategory,
  lang,
}: {
  ticketId: string | null;
  customer: string;
  selectedTicketStatus: string | null;
  selectedTicketCategory: string | null;
  lang: string;
}) {
  const { t } = useTranslation("dashboard");
  const { setPendingEscalation } = useTriageStore();

  const [escalation,     setEscalation]     = useState<EscalationResult | null>(null);
  const [reasonsLoading, setReasonsLoading] = useState(false);
  const [editMode,       setEditMode]       = useState(false);
  const [escReason,      setEscReason]      = useState("");
  const [escalating,     setEscalating]     = useState(false);
  const [escalatedAt,    setEscalatedAt]    = useState<string | null>(null);

  useEffect(() => {
    if (!ticketId) { setEscalation(null); setEscalatedAt(null); setEditMode(false); return; }
    setEscalation(null); setEscalatedAt(null); setEditMode(false); setReasonsLoading(true);
    requestEscalationReasons(ticketId)
      .then(async (res) => { if (!res.ok) return; setEscalation(await res.json()); })
      .catch(() => {})
      .finally(() => setReasonsLoading(false));
  }, [ticketId]);

  async function handleEscalate() {
    if (!ticketId || escalating) return;
    setEscalating(true);
    try {
      await escalateTicket(ticketId, escReason || undefined);
    } catch { /* fire-and-forget */ }
    finally {
      const ts = new Date().toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" });
      setEscalatedAt(ts);
      setPendingEscalation(ticketId!);
      setEditMode(false);
      setEscalating(false);
    }
  }

  const reasons = escalation?.reasons ?? [];
  const level   = escalation?.recommendedLevel ?? 2;
  const conf    = escalation?.confidence ?? 0;
  const sev     = topSeverity(reasons);

  if (!ticketId) {
    return (
      <Text tag="p" fontSize={12} color="var(--k-text-tertiary)" fontStyle="italic" margin={0} display="block">
        {t("ai.noEscalationSignals")}
      </Text>
    );
  }

  return (
    <Box display="flex" flexDirection="column" gap={12}>

      {/* Escalation reasons */}
      <Box borderRadius={8} borderWidth={1} borderColor="var(--k-border)" borderLeftWidth={3} borderLeftColor={SEVERITY_BORDER[sev]} padding={12} borderStyle="solid">
        <Text tag="p" fontSize={12} fontWeight={500} color={sev === "none" ? "var(--k-text-secondary)" : "var(--kairo-color-bad-ink)"} marginTop={0} marginHorizontal={0} marginBottom={8} display="block">
          {t("ai.escalationSuggested")}
        </Text>
        {reasonsLoading ? (
          <Box display="flex" flexDirection="column" gap={6}>
            <Skeleton height={10} width="80%" />
            <Skeleton height={10} width="60%" />
          </Box>
        ) : reasons.length === 0 ? (
          <Text tag="p" fontSize={12} color="var(--k-text-tertiary)" fontStyle="italic" margin={0} display="block">
            {t("ai.noEscalationSignals")}
          </Text>
        ) : (
          <>
            {conf > 0.80 && (
              <Text tag="p" fontSize={10} fontWeight={600} color="var(--kairo-color-ok)" textTransform="uppercase" letterSpacing={0.4} marginTop={0} marginHorizontal={0} marginBottom={8} display="block">
                {t("ai.highConfidence")}
              </Text>
            )}
            <Box display="flex" flexWrap="wrap" gap={6}>
              {reasons.map((r) => {
                const chip = SEVERITY_CHIP[r.severity] ?? SEVERITY_CHIP.low;
                return (
                  <Text key={r.id} display="inline-flex" alignItems="center" borderRadius={999} paddingVertical={2} paddingHorizontal={8} fontSize={11} fontWeight={500} backgroundColor={chip.bg} color={chip.color} borderWidth={1} borderColor={chip.border} borderStyle="solid">
                    {lang === "en" ? r.label_en : r.label_es}
                  </Text>
                );
              })}
            </Box>
          </>
        )}
      </Box>

      {/* Escalation packet */}
      {escalatedAt ? (
        <Text tag="div" display="flex" alignItems="center" gap={6} fontSize={12} color="var(--kairo-color-ok)" fontWeight={500}>
          <Icon name="resolve" size={13} />
          <span>{t("ai.escalatedSuccess")} {escalatedAt}</span>
        </Text>
      ) : (
        <>
          {/* Context summary */}
          <Box grid gridTemplateColumns="1fr 1fr 1fr" gap={6}>
            {([
              { labelKey: "ai.customer", value: customer },
              { labelKey: "ai.workflow", value: selectedTicketCategory ?? "—" },
              { labelKey: "ai.status",   value: selectedTicketStatus   ?? "—" },
            ] as const).map(({ labelKey, value }) => (
              <Text tag="div" key={labelKey} borderRadius={6} paddingVertical={8} paddingHorizontal={6} textAlign="center" backgroundColor="var(--k-surface)" borderWidth={1} borderColor="var(--k-border-subtle)" display="block" borderStyle="solid">
                <Text tag="p" fontSize={10} color="var(--k-text-tertiary)" marginTop={0} marginHorizontal={0} marginBottom={2} font="mono" textTransform="uppercase" letterSpacing={0.4} display="block">
                  {t(labelKey)}
                </Text>
                <Text tag="p" fontSize={11} fontWeight={500} color="var(--k-text-primary)" overflow="hidden" textOverflow="ellipsis" whiteSpace="nowrap" margin={0} display="block">
                  {value}
                </Text>
              </Text>
            ))}
          </Box>

          {editMode && (
            <Field label={t("ai.escalationReason")}>
              <FieldTextarea
                value={escReason}
                onChangeText={setEscReason}
                placeholder={t("ai.escalationReasonPlaceholder")}
                rows={3}
              />
            </Field>
          )}

          <Box display="flex" gap={6}>
            {editMode ? (
              <>
                <Button flex={1} onPress={() => setEditMode(false)}>
                  {t("ai.cancelEdit")}
                </Button>
                <Button variant="primary" flex={1} loading={escalating} loadingLabel={t("ai.escalating")} onPress={handleEscalate}>
                  {t("ai.confirmEscalation")}
                </Button>
              </>
            ) : (
              <>
                <Button onPress={() => setEditMode(true)}>
                  {t("ai.editDetails")}
                </Button>
                <Button variant="primary" flex={1} loading={escalating} loadingLabel={t("ai.escalating")} onPress={handleEscalate}>
                  {t("ai.escalateToLevel", { level })}
                </Button>
              </>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// AiAssistant — Right Rail (FIG 2.3)
// Owns the client-profile fetch so it runs regardless of active tab.
// ---------------------------------------------------------------------------

interface AiAssistantProps {
  customer: string;
}

export function AiAssistant({ customer }: AiAssistantProps) {
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
        ...(assistantTabEnabled ? [{ id: "assistant" as const, label: t("ai.tabAssistant"), ai: true }] : []),
        ...(clientTabEnabled ? [{ id: "client" as const, label: t("ai.tabClient") }] : []),
        ...(similarTabEnabled ? [{ id: "similar" as const, label: t("ai.tabSimilar") }] : []),
        ...(articlesTabEnabled ? [{ id: "articles" as const, label: t("ai.tabArticles") }] : []),
        ...(escalateTabEnabled ? [{ id: "escalate" as const, label: t("ai.tabEscalate") }] : []),
        // KAI-232 — gated by the shared internal-notes flag, not a tab-specific
        // one: the whole internal-notes surface lives or dies together.
        ...(INTERNAL_NOTES_ENABLED ? [{ id: "notes" as const, label: t("ai.tabNotes") }] : []),
      ]),
    [t]
  );
  const defaultTabId: TabId = tabs[0]?.id ?? "assistant";

  const [activeTab,      setActiveTab]      = useState<TabId>(defaultTabId);
  const [profileLoading, setProfileLoading] = useState(false);

  // KAI-232 — unread mentions on the selected ticket, for the Notes tab badge.
  const noteCounts = useTriageStore((s) => s.noteCounts);
  const requestComposeNote = useTriageStore((s) => s.requestComposeNote);
  const notesBadge = selectedTicketId
    ? (noteCounts[selectedTicketId]?.unread_mentions ?? 0)
    : 0;

  // Single fetch owned here — runs on ticket change regardless of active tab.
  // ClientProfileCard reads from store only (pure display component).
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

  // Reset to the first tab (per VITE_FF_RIGHT_PANEL_TAB_ORDER) when ticket changes.
  useEffect(() => { setActiveTab(defaultTabId); }, [selectedTicketId, defaultTabId]);

  // Drag-to-resize. Floor = the current fixed width (340). Ceiling is computed
  // so the center column keeps a usable width; the left rail + ticket list
  // (reserveLeft) are never touched — only the center yields. See the hook.
  const { panelRef, width, max, setWidth, commit, reset } = useResizablePanel({
    min: RESIZE_MIN,   // current fixed design width — the minimum
    cap: 720,          // absolute ceiling (optimal reading/chat line length)
    reserveLeft: 360,  // fixed ticket-list column to the panel's left
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
          <ClientTab loading={profileLoading} />
        )}
        {similarTabEnabled && activeTab === "similar" && (
          <SimilarTab ticketId={selectedTicketId} lang={i18n.language} />
        )}
        {articlesTabEnabled && activeTab === "articles" && (
          <ArticlesTab ticketId={selectedTicketId} />
        )}
        {escalateTabEnabled && activeTab === "escalate" && (
          <EscalateTab
            ticketId={selectedTicketId}
            customer={customer}
            selectedTicketStatus={selectedTicket?.status ?? null}
            selectedTicketCategory={selectedTicket?.category ?? null}
            lang={i18n.language}
          />
        )}
        {INTERNAL_NOTES_ENABLED && activeTab === "notes" && (
          <NotesPanel ticketId={selectedTicketId} onNewNote={requestComposeNote} />
        )}
      </Box>
      )}
    </Box>
  );
}
