import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, BookOpen, Clock, MessageSquarePlus } from "lucide-react";
import { useTriageStore } from "@/stores/triage-store";
import { apiCall } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Types — aligned with GET /api/v1/tickets/:id/related-history response
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
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatSimilarity(s: number | null): string | null {
  if (s === null) return null;
  return `${Math.round(s * 100)}%`;
}

// ---------------------------------------------------------------------------
// Section panel (collapsible)
// ---------------------------------------------------------------------------

function SectionPanel({
  icon,
  title,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div style={{ borderRadius: 10, border: "1px solid var(--k-border)", background: "white", overflow: "hidden" }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between",
          padding: "9px 12px", background: "none", border: "none", cursor: "pointer",
          gap: 6,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500, color: "var(--k-text-secondary)" }}>
          {icon}
          {title}
        </span>
        {open
          ? <ChevronUp style={{ width: 14, height: 14, color: "var(--k-text-tertiary)", flexShrink: 0 }} />
          : <ChevronDown style={{ width: 14, height: 14, color: "var(--k-text-tertiary)", flexShrink: 0 }} />}
      </button>
      {open && (
        <div style={{ borderTop: "1px solid var(--k-border-subtle)", padding: "10px 12px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KnowledgePanel
// ---------------------------------------------------------------------------

interface KnowledgePanelProps {
  ticketId: string | null;
}

export function KnowledgePanel({ ticketId }: KnowledgePanelProps) {
  const { t, i18n } = useTranslation("dashboard");
  const setSuggestedReply = useTriageStore((s) => s.setSuggestedReply);

  const [kbOpen,      setKbOpen]      = useState(true);
  const [casesOpen,   setCasesOpen]   = useState(true);

  const [kbArticles,    setKbArticles]    = useState<KbArticle[]>([]);
  const [similarCases,  setSimilarCases]  = useState<SimilarCase[]>([]);
  const [casesLoading,  setCasesLoading]  = useState(false);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

  useEffect(() => {
    if (!ticketId) {
      setKbArticles([]);
      setSimilarCases([]);
      setExpandedCase(null);
      return;
    }

    setKbArticles([]);
    setSimilarCases([]);
    setExpandedCase(null);
    setCasesLoading(true);

    apiCall(`/api/v1/tickets/${ticketId}/related-history`)
      .then(async (res) => {
        if (!res.ok) return;
        const json: { data: SimilarCase[] } = await res.json();
        setSimilarCases((json.data ?? []).slice(0, 2));
      })
      .catch(() => { /* not available — silent empty state */ })
      .finally(() => setCasesLoading(false));
  }, [ticketId]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* ── KB Articles ────────────────────────────────────────────────────── */}
      <SectionPanel
        icon={<BookOpen style={{ width: 13, height: 13, color: "var(--k-text-tertiary)" }} />}
        title={t("ai.kbArticles")}
        open={kbOpen}
        onToggle={() => setKbOpen((v) => !v)}
      >
        {kbArticles.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", fontStyle: "italic", lineHeight: 1.5, margin: 0 }}>
            {t("ai.noKbArticles")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {kbArticles.map((article) => (
              <div
                key={article.id}
                style={{
                  borderRadius: 8,
                  border: "1px solid var(--k-border)",
                  borderLeft: "3px solid var(--k-accent)",
                  padding: "10px 10px 10px 12px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--k-text-primary)", lineHeight: 1.35 }}>
                    {article.title}
                  </span>
                  {formatSimilarity(article.similarity) && (
                    <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 500, fontFamily: "var(--k-font-mono)", padding: "2px 6px", borderRadius: 4, background: "var(--k-accent-subtle)", color: "var(--k-accent)" }}>
                      {formatSimilarity(article.similarity)}
                    </span>
                  )}
                </div>

                {article.tags && article.tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {article.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{ fontSize: 10, padding: "2px 6px", borderRadius: 999, background: "var(--k-surface-2)", color: "var(--k-text-tertiary)" }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 500, color: "var(--k-accent)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                  onClick={() => setSuggestedReply(article.content)}
                >
                  <MessageSquarePlus style={{ width: 12, height: 12 }} />
                  {t("ai.useInReply")} →
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionPanel>

      {/* ── Similar Resolved Cases ──────────────────────────────────────────── */}
      <SectionPanel
        icon={<Clock style={{ width: 13, height: 13, color: "var(--k-text-tertiary)" }} />}
        title={t("ai.similarCases")}
        open={casesOpen}
        onToggle={() => setCasesOpen((v) => !v)}
      >
        {casesLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="shimmer" style={{ height: 10, width: "90%" }} />
            <div className="shimmer" style={{ height: 10, width: "70%" }} />
          </div>
        ) : similarCases.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", fontStyle: "italic", margin: 0 }}>
            {t("ai.noSimilarCases")}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {similarCases.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: 12,
                  border: "1px solid var(--k-border)",
                  borderRadius: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 2 }}>
                  <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 11, color: "var(--k-text-tertiary)" }}>
                    {t("ai.ticketNumber", { number: c.ticket_number })}
                  </span>
                  {formatSimilarity(c.similarity) && (
                    <span style={{ flexShrink: 0, fontFamily: "var(--k-font-mono)", fontSize: 11, color: "#10B981" }}>
                      {formatSimilarity(c.similarity)} sim
                    </span>
                  )}
                </div>

                {c.subject && (
                  <p style={{ fontSize: 13, fontWeight: 500, color: "var(--k-text-primary)", lineHeight: 1.35, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {c.subject}
                  </p>
                )}

                {c.resolved_at && (
                  <p style={{ fontSize: 11, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", margin: 0 }}>
                    {t("ai.resolvedOn")} {formatDate(c.resolved_at, i18n.language)}
                  </p>
                )}

                {c.resolution_summary && (
                  <>
                    <button
                      style={{ fontSize: 11, fontWeight: 500, color: "var(--k-accent)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                      onClick={() => setExpandedCase((prev) => (prev === c.id ? null : c.id))}
                    >
                      {expandedCase === c.id ? t("ai.hideResolution") : t("ai.viewResolution")} →
                    </button>

                    {expandedCase === c.id && (
                      <p style={{ marginTop: 4, borderRadius: 6, background: "var(--k-surface)", padding: "8px 10px", fontSize: 12, lineHeight: 1.55, color: "var(--k-text-secondary)" }}>
                        {c.resolution_summary}
                      </p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionPanel>

    </div>
  );
}
