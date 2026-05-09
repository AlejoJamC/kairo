import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, BookOpen, Clock, MessageSquarePlus } from "lucide-react";
import {
  Card, CardContent, CardHeader, CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@kairo/ui";
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

// KB articles shape — for when the endpoint is implemented (currently empty)
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

  // KB articles — empty until backend endpoint is created (degrade silently)
  const [kbArticles,    setKbArticles]    = useState<KbArticle[]>([]);

  // Similar resolved cases — from existing /related-history endpoint
  const [similarCases,  setSimilarCases]  = useState<SimilarCase[]>([]);
  const [casesLoading,  setCasesLoading]  = useState(false);

  // Inline expanded resolution for each case
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

    // Similar cases — endpoint exists, degrade to [] on any error
    apiCall(`/api/v1/tickets/${ticketId}/related-history`)
      .then(async (res) => {
        if (!res.ok) return;
        const json: { data: SimilarCase[] } = await res.json();
        setSimilarCases((json.data ?? []).slice(0, 2));
      })
      .catch(() => { /* not available — silent empty state */ })
      .finally(() => setCasesLoading(false));

    // KB articles — endpoint not yet created; shows empty state immediately.
    // Wire here when GET /api/v1/tickets/:id/knowledge-context is implemented.
  }, [ticketId]);

  return (
    <div className="space-y-3">

      {/* ── KB Articles ────────────────────────────────────────────────────── */}
      <Collapsible open={kbOpen} onOpenChange={setKbOpen}>
        <Card className="gap-0 py-0 shadow-sm hover:shadow-md transition-shadow duration-150">
          <CollapsibleTrigger>
            <CardHeader className="cursor-pointer px-3 py-2.5">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-zinc-700">
                <span className="flex items-center gap-1.5">
                  <BookOpen className="h-3.5 w-3.5 text-zinc-400" />
                  {t("ai.kbArticles")}
                </span>
                {kbOpen
                  ? <ChevronUp className="h-4 w-4 text-zinc-400" />
                  : <ChevronDown className="h-4 w-4 text-zinc-400" />}
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="px-3 pb-3 pt-0">
              {kbArticles.length === 0 ? (
                <p className="text-xs text-zinc-400 italic leading-relaxed">
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
                      {/* Title + similarity */}
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

                      {/* Tag chips */}
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

                      {/* Use in reply */}
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
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── Similar Resolved Cases ──────────────────────────────────────────── */}
      <Collapsible open={casesOpen} onOpenChange={setCasesOpen}>
        <Card className="gap-0 py-0 shadow-sm hover:shadow-md transition-shadow duration-150">
          <CollapsibleTrigger>
            <CardHeader className="cursor-pointer px-3 py-2.5">
              <CardTitle className="flex items-center justify-between text-sm font-medium text-zinc-700">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-zinc-400" />
                  {t("ai.similarCases")}
                </span>
                {casesOpen
                  ? <ChevronUp className="h-4 w-4 text-zinc-400" />
                  : <ChevronDown className="h-4 w-4 text-zinc-400" />}
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <CardContent className="px-3 pb-3 pt-0">
              {casesLoading ? (
                <p className="text-xs text-zinc-400 animate-pulse">
                  {t("ai.similarCases")}...
                </p>
              ) : similarCases.length === 0 ? (
                <p className="text-xs text-zinc-400 italic">
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
                      {/* Ticket number + similarity */}
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

                      {/* Subject */}
                      {c.subject && (
                        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--k-text-primary)", lineHeight: 1.35, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {c.subject}
                        </p>
                      )}

                      {/* Resolved date */}
                      {c.resolved_at && (
                        <p style={{ fontSize: 11, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", margin: 0 }}>
                          {t("ai.resolvedOn")} {formatDate(c.resolved_at, i18n.language)}
                        </p>
                      )}

                      {/* View / hide resolution */}
                      {c.resolution_summary && (
                        <>
                          <button
                            style={{ fontSize: 11, fontWeight: 500, color: "var(--k-accent)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
                            onClick={() =>
                              setExpandedCase((prev) => (prev === c.id ? null : c.id))
                            }
                          >
                            {expandedCase === c.id
                              ? t("ai.hideResolution")
                              : t("ai.viewResolution")} →
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
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

    </div>
  );
}
