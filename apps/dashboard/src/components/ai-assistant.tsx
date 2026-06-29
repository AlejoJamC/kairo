import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2, Loader2, BookOpen, MessageSquarePlus,
} from "lucide-react";
import { useTriageStore } from "@/stores/triage-store";
import { apiCall } from "@/lib/api-client";
import type { ClientProfile } from "@/stores/triage-store";
import {
  ClientProfileCard,
  ClientProfileSkeleton,
} from "@/components/triage/ClientProfileCard";
import { useResizablePanel } from "@/hooks/use-resizable-panel";
import { AssistantPanel } from "@/components/triage/AssistantPanel";

// ═══════════════════════════════════════════════════════════════════════════
// Dashboard > Right Panel — Feature Flags (VITE_FF_*)
// ═══════════════════════════════════════════════════════════════════════════
// Each tab can be enabled/disabled via VITE_FF_ENABLE_<TAB_NAME> in .env
// Default: false (disabled) — only renders if explicitly enabled
// ═══════════════════════════════════════════════════════════════════════════

export function isFlagEnabled(value: string | undefined): boolean {
  return value === "true";
}

const assistantTabEnabled = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_ASSISTANT_TAB);
const clientTabEnabled    = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_CLIENT_TAB);
const similarTabEnabled   = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_SIMILAR_TAB);
const articlesTabEnabled  = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_ARTICLES_TAB);
const escalateTabEnabled  = isFlagEnabled(import.meta.env.VITE_FF_ENABLE_ESCALATE_TAB);

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
  high:   { bg: "#FEE2E2", color: "#DC2626", border: "#FECACA" },
  medium: { bg: "#FFEDD5", color: "#C2410C", border: "#FED7AA" },
  low:    { bg: "#FEF9C3", color: "#B45309", border: "#FEF08A" },
};

const SEVERITY_BORDER: Record<string, string> = {
  high: "#EF4444", medium: "#FB923C", low: "#FBBF24", none: "var(--k-border)",
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

const TAB_IDS = ["assistant", "client", "similar", "articles", "escalate"] as const;
type TabId = typeof TAB_IDS[number];

// ---------------------------------------------------------------------------
// ClientTab — uses ClientProfileCard (pure display) + adds KPI grid
// ---------------------------------------------------------------------------

function ClientTab({ loading }: { loading: boolean }) {
  const { t, i18n } = useTranslation("dashboard");
  const clientProfile = useTriageStore((s) => s.clientProfile);

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <ClientProfileSkeleton />
        <div className="shimmer" style={{ height: 112, borderRadius: 8 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="shimmer" style={{ height: 9, width: 100 }} />
          <div className="shimmer" style={{ height: 9, width: "90%" }} />
          <div className="shimmer" style={{ height: 9, width: "80%" }} />
        </div>
      </div>
    );
  }

  const PLAN_STYLE: Record<string, { bg: string; color: string; border: string }> = {
    enterprise: { bg: "#F3F0FF", color: "#6D28D9", border: "#DDD6FE" },
    pro:        { bg: "#EEF2FF", color: "#2B5BFF", border: "#C7D2FE" },
    starter:    { bg: "#ECFDF5", color: "#047857", border: "#A7F3D0" },
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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <ClientProfileCard />

      {/* KPI grid */}
      {clientProfile && (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1,
          background: "var(--k-border-subtle)", border: "1px solid var(--k-border)",
          borderRadius: 8, overflow: "hidden",
        }}>
          {kpis.map((kpi) => {
            const planStyle = PLAN_STYLE[kpi.value] ?? PLAN_STYLE.unknown;
            return (
              <div key={kpi.label} style={{ background: "white", padding: 10 }}>
                <div style={{ fontSize: 10, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {kpi.label}
                </div>
                {kpi.isBadge ? (
                  <span style={{
                    display: "inline-flex", alignItems: "center", borderRadius: 999, marginTop: 4,
                    padding: "2px 8px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em",
                    background: planStyle.bg, color: planStyle.color, border: `1px solid ${planStyle.border}`,
                  }}>
                    {kpi.value}
                  </span>
                ) : (
                  <div
                    title={kpi.tooltip}
                    style={{
                      fontSize: 14, fontWeight: 500, marginTop: 2,
                      color: kpi.accent ? "var(--k-accent)" : "var(--k-text-primary)",
                      cursor: kpi.tooltip ? "default" : undefined,
                    }}
                  >
                    {kpi.value}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Last interactions */}
      {clientProfile && clientProfile.recentTickets.length > 0 && (
        <div>
          <p style={{ fontSize: 10, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }}>
            {t("ai.lastInteractions")}
          </p>
          {clientProfile.recentTickets.slice(0, 3).map((rt, i) => {
            const dateStr = rt.resolved_at ?? rt.created_at;
            const label = dateStr
              ? new Date(dateStr).toLocaleDateString(i18n.language === "en" ? "en-US" : "es-ES", { day: "2-digit", month: "short" })
              : "—";
            return (
              <div key={rt.id} style={{
                display: "flex", gap: 10, padding: "8px 0", fontSize: 12,
                borderTop: i > 0 ? "1px solid var(--k-border-subtle)" : "none",
              }}>
                <span style={{ fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", width: 44, flexShrink: 0 }}>
                  {label}
                </span>
                <span style={{ color: "var(--k-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  {rt.subject ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
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
    apiCall(`/api/v1/tickets/${ticketId}/related-history`)
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
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="shimmer" style={{ height: 80, borderRadius: 8 }} />
        <div className="shimmer" style={{ height: 80, borderRadius: 8 }} />
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", fontStyle: "italic", margin: 0 }}>
        {t("ai.noSimilarCases")}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 11, color: "var(--k-text-tertiary)", fontFamily: "var(--k-font-mono)", margin: "0 0 4px" }}>
        {cases.length} {t("ai.resolvedCases")}
      </p>
      {cases.map((c) => (
        <div key={c.id} style={{ padding: 12, border: "1px solid var(--k-border)", borderRadius: 8, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 11, color: "var(--k-text-tertiary)" }}>
              {t("ai.ticketNumber", { number: c.ticket_number })}
            </span>
            {formatSim(c.similarity) && (
              <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 11, color: "#10B981", flexShrink: 0 }}>
                {formatSim(c.similarity)} sim
              </span>
            )}
          </div>
          {c.subject && (
            <p style={{ fontSize: 13, fontWeight: 500, color: "var(--k-text-primary)", lineHeight: 1.35, margin: 0 }}>
              {c.subject}
            </p>
          )}
          {c.resolved_at && (
            <p style={{ fontSize: 11, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", margin: 0 }}>
              {t("ai.resolvedOn")} {formatDate(c.resolved_at, lang)}
            </p>
          )}
          {c.resolution_summary && (
            <>
              <button
                style={{ fontSize: 11, fontWeight: 500, color: "var(--k-accent)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                onClick={() => setExpandedCase((p) => (p === c.id ? null : c.id))}
              >
                {expandedCase === c.id ? t("ai.hideResolution") : t("ai.viewResolution")} →
              </button>
              {expandedCase === c.id && (
                <>
                  <p style={{ marginTop: 4, borderRadius: 6, background: "var(--k-surface)", padding: "8px 10px", fontSize: 12, lineHeight: 1.55, color: "var(--k-text-secondary)" }}>
                    {c.resolution_summary}
                  </p>
                  <button
                    style={{ fontSize: 11, color: "var(--k-accent)", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", display: "flex", alignItems: "center", gap: 4 }}
                    onClick={() => setSuggestedReply(c.resolution_summary!)}
                  >
                    <MessageSquarePlus style={{ width: 12, height: 12 }} />
                    {t("ai.useInReply")}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      ))}
    </div>
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
    apiCall(`/api/v1/tickets/${ticketId}/knowledge-context`)
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
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="shimmer" style={{ height: 72, borderRadius: 8 }} />
        <div className="shimmer" style={{ height: 72, borderRadius: 8 }} />
      </div>
    );
  }

  if (!ticketId || articles.length === 0) {
    return (
      <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", fontStyle: "italic", margin: 0 }}>
        {t("ai.noKbArticles")}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {articles.map((article) => (
        <div
          key={article.id}
          style={{ borderRadius: 8, border: "1px solid var(--k-border)", borderLeft: "3px solid var(--k-accent)", padding: "10px 10px 10px 12px", display: "flex", flexDirection: "column", gap: 6 }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--k-text-primary)", lineHeight: 1.35, display: "flex", alignItems: "center", gap: 6 }}>
              <BookOpen style={{ width: 13, height: 13, color: "var(--k-text-tertiary)", flexShrink: 0 }} />
              {article.title}
            </span>
            {formatSim(article.similarity) && (
              <span style={{ flexShrink: 0, fontSize: 10, fontFamily: "var(--k-font-mono)", padding: "2px 6px", borderRadius: 4, background: "var(--k-accent-subtle)", color: "var(--k-accent)" }}>
                {formatSim(article.similarity)}
              </span>
            )}
          </div>
          {article.tags && article.tags.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {article.tags.map((tag) => (
                <span key={tag} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 999, background: "var(--k-surface-2)", color: "var(--k-text-tertiary)" }}>
                  {tag}
                </span>
              ))}
            </div>
          )}
          <button
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 500, color: "var(--k-accent)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            onClick={() => setSuggestedReply(article.content)}
          >
            <MessageSquarePlus style={{ width: 12, height: 12 }} />
            {t("ai.useInReply")}
          </button>
        </div>
      ))}
    </div>
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
    apiCall(`/api/v1/tickets/${ticketId}/escalation-reasons`, { method: "POST" })
      .then(async (res) => { if (!res.ok) return; setEscalation(await res.json()); })
      .catch(() => {})
      .finally(() => setReasonsLoading(false));
  }, [ticketId]);

  async function handleEscalate() {
    if (!ticketId || escalating) return;
    setEscalating(true);
    try {
      await apiCall(`/api/v1/tickets/${ticketId}/escalate`, {
        method: "POST",
        body: JSON.stringify({ reason: escReason || undefined }),
      });
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
      <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", fontStyle: "italic", margin: 0 }}>
        {t("ai.noEscalationSignals")}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Escalation reasons */}
      <div style={{ borderRadius: 8, border: "1px solid var(--k-border)", borderLeft: `3px solid ${SEVERITY_BORDER[sev]}`, padding: 12 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: sev === "none" ? "var(--k-text-secondary)" : "#DC2626", margin: "0 0 8px" }}>
          {t("ai.escalationSuggested")}
        </p>
        {reasonsLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="shimmer" style={{ height: 10, width: "80%" }} />
            <div className="shimmer" style={{ height: 10, width: "60%" }} />
          </div>
        ) : reasons.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", fontStyle: "italic", margin: 0 }}>
            {t("ai.noEscalationSignals")}
          </p>
        ) : (
          <>
            {conf > 0.80 && (
              <p style={{ fontSize: 10, fontWeight: 600, color: "#10B981", textTransform: "uppercase", letterSpacing: "0.04em", margin: "0 0 8px" }}>
                {t("ai.highConfidence")}
              </p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {reasons.map((r) => {
                const chip = SEVERITY_CHIP[r.severity] ?? SEVERITY_CHIP.low;
                return (
                  <span key={r.id} style={{ display: "inline-flex", alignItems: "center", borderRadius: 999, padding: "2px 8px", fontSize: 11, fontWeight: 500, background: chip.bg, color: chip.color, border: `1px solid ${chip.border}` }}>
                    {lang === "en" ? r.label_en : r.label_es}
                  </span>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Escalation packet */}
      {escalatedAt ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#10B981", fontWeight: 500 }}>
          <CheckCircle2 style={{ width: 13, height: 13 }} />
          <span>{t("ai.escalatedSuccess")} {escalatedAt}</span>
        </div>
      ) : (
        <>
          {/* Context summary */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {([
              { labelKey: "ai.customer", value: customer },
              { labelKey: "ai.workflow", value: selectedTicketCategory ?? "—" },
              { labelKey: "ai.status",   value: selectedTicketStatus   ?? "—" },
            ] as const).map(({ labelKey, value }) => (
              <div key={labelKey} style={{ borderRadius: 6, padding: "8px 6px", textAlign: "center", background: "var(--k-surface)", border: "1px solid var(--k-border-subtle)" }}>
                <p style={{ fontSize: 10, color: "var(--k-text-tertiary)", margin: "0 0 2px", fontFamily: "var(--k-font-mono)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                  {t(labelKey)}
                </p>
                <p style={{ fontSize: 11, fontWeight: 500, color: "var(--k-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
                  {value}
                </p>
              </div>
            ))}
          </div>

          {editMode && (
            <div>
              <label className="k-label" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {t("ai.escalationReason")}
              </label>
              <textarea
                value={escReason}
                onChange={(e) => setEscReason(e.target.value)}
                placeholder={t("ai.escalationReasonPlaceholder")}
                rows={3}
                className="k-textarea"
                style={{ fontSize: 12 }}
              />
            </div>
          )}

          <div style={{ display: "flex", gap: 6 }}>
            {editMode ? (
              <>
                <button className="k-btn-secondary" style={{ flex: 1, fontSize: 12 }} onClick={() => setEditMode(false)}>
                  {t("ai.cancelEdit")}
                </button>
                <button className="k-btn-primary" style={{ flex: 1, fontSize: 12 }} disabled={escalating} onClick={handleEscalate}>
                  {escalating && <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />}
                  {escalating ? t("ai.escalating") : t("ai.confirmEscalation")}
                </button>
              </>
            ) : (
              <>
                <button className="k-btn-secondary" style={{ fontSize: 12 }} onClick={() => setEditMode(true)}>
                  {t("ai.editDetails")}
                </button>
                <button className="k-btn-primary" style={{ flex: 1, fontSize: 12 }} disabled={escalating} onClick={handleEscalate}>
                  {escalating && <Loader2 style={{ width: 12, height: 12 }} className="animate-spin" />}
                  {escalating ? t("ai.escalating") : t("ai.escalateToLevel", { level })}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
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

  const [activeTab,      setActiveTab]      = useState<TabId>("assistant");
  const [profileLoading, setProfileLoading] = useState(false);

  // Single fetch owned here — runs on ticket change regardless of active tab.
  // ClientProfileCard reads from store only (pure display component).
  useEffect(() => {
    if (!selectedTicketId) { setClientProfile(null); return; }
    setClientProfile(null);
    setProfileLoading(true);
    apiCall(`/api/v1/tickets/${selectedTicketId}/client-profile`)
      .then(async (res) => {
        if (!res.ok) return;
        setClientProfile(await res.json() as ClientProfile);
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [selectedTicketId]);

  // Reset to "assistant" tab when ticket changes
  useEffect(() => { setActiveTab("assistant"); }, [selectedTicketId]);

  const tabs: { id: TabId; label: string; disabled?: boolean; ai?: boolean }[] = [
    ...(assistantTabEnabled ? [{ id: "assistant" as const, label: t("ai.tabAssistant"), ai: true }] : []),
    ...(clientTabEnabled ? [{ id: "client" as const, label: t("ai.tabClient") }] : []),
    ...(similarTabEnabled ? [{ id: "similar" as const, label: t("ai.tabSimilar") }] : []),
    ...(articlesTabEnabled ? [{ id: "articles" as const, label: t("ai.tabArticles") }] : []),
    ...(escalateTabEnabled ? [{ id: "escalate" as const, label: t("ai.tabEscalate") }] : []),
  ];

  // Drag-to-resize. Floor = the current fixed width (340). Ceiling is computed
  // so the center column keeps a usable width; the left rail + ticket list
  // (reserveLeft) are never touched — only the center yields. See the hook.
  const { panelRef, width, onHandleMouseDown, reset } = useResizablePanel({
    min: 340,          // current fixed design width — the minimum
    cap: 720,          // absolute ceiling (optimal reading/chat line length)
    reserveLeft: 360,  // fixed ticket-list column to the panel's left
    centerMin: 520,    // smallest comfortable width for the email/composer column
  });

  return (
    <div ref={panelRef} style={{ position: "relative", width, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%", borderLeft: "1px solid var(--k-border)", background: "white" }}>

      {/* Resize handle — drag the left edge to widen (steals from center only);
          double-click to reset to the minimum width. */}
      <div
        onMouseDown={onHandleMouseDown}
        onDoubleClick={reset}
        title={t("ai.resizeHint")}
        style={{ position: "absolute", left: -3, top: 0, bottom: 0, width: 6, cursor: "col-resize", zIndex: 5 }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--k-accent-subtle)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      />

      {/* Header + tab bar */}
      <div style={{ padding: "12px 14px 0", flexShrink: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: "var(--k-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 10px", fontFamily: "var(--k-font-mono)" }}>
          {t("ai.panelTitle")}
        </p>
        <div style={{ display: "flex", borderBottom: "1px solid var(--k-border)" }}>
          {tabs.map(({ id, label, disabled, ai }) => (
            <button
              key={id}
              type="button"
              onClick={() => !disabled && setActiveTab(id)}
              disabled={disabled}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                padding: "8px 10px",
                fontWeight: activeTab === id ? 500 : 400,
                color: disabled
                  ? "var(--k-text-disabled, #C0C0C0)"
                  : activeTab === id ? "var(--k-text-primary)" : "var(--k-text-tertiary)",
                borderBottom: `2px solid ${activeTab === id ? "var(--k-accent)" : "transparent"}`,
                marginBottom: -1,
                background: "none",
                border: "none",
                borderBottomStyle: "solid",
                cursor: disabled ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                transition: "color 0.1s",
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {ai && (
                <span style={{ width: 5, height: 5, borderRadius: 999, flexShrink: 0, background: "var(--k-gradient-ai)" }} />
              )}
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content — the Assistant chat owns full height (internal scroll +
          pinned composer); the other tabs use a padded, scrollable container. */}
      {assistantTabEnabled && activeTab === "assistant" ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <AssistantPanel />
        </div>
      ) : (
      <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
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
      </div>
      )}
    </div>
  );
}
