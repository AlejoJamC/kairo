import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, BookOpen, Clock, MessageSquarePlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
          <CollapsibleTrigger asChild>
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
                <div className="space-y-2">
                  {kbArticles.map((article) => (
                    <div
                      key={article.id}
                      className="rounded-md border border-zinc-200 px-2.5 py-2 text-xs space-y-1.5"
                    >
                      {/* Title + similarity */}
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium text-zinc-800 leading-snug">
                          {article.title}
                        </span>
                        {formatSimilarity(article.similarity) && (
                          <span className="shrink-0 rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                            {formatSimilarity(article.similarity)}
                          </span>
                        )}
                      </div>

                      {/* Tag chips */}
                      {article.tags && article.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {article.tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-500"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Use in reply */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 w-full gap-1 text-[11px]"
                        onClick={() => setSuggestedReply(article.content)}
                      >
                        <MessageSquarePlus className="h-3 w-3" />
                        {t("ai.useInReply")}
                      </Button>
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
          <CollapsibleTrigger asChild>
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
                <div className="space-y-2">
                  {similarCases.map((c) => (
                    <div
                      key={c.id}
                      className="rounded-md border border-zinc-200 px-2.5 py-2 text-xs space-y-1.5"
                    >
                      {/* Ticket number + similarity */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-zinc-500">
                          {t("ai.ticketNumber", { number: c.ticket_number })}
                        </span>
                        {formatSimilarity(c.similarity) && (
                          <span className="shrink-0 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-600">
                            {formatSimilarity(c.similarity)}
                          </span>
                        )}
                      </div>

                      {/* Subject */}
                      {c.subject && (
                        <p className="text-zinc-800 leading-snug line-clamp-2">
                          {c.subject}
                        </p>
                      )}

                      {/* Resolved date */}
                      {c.resolved_at && (
                        <p className="text-[10px] text-zinc-400">
                          {t("ai.resolvedOn")} {formatDate(c.resolved_at, i18n.language)}
                        </p>
                      )}

                      {/* View / hide resolution */}
                      {c.resolution_summary && (
                        <>
                          <button
                            className="text-[11px] font-medium text-blue-600 hover:underline"
                            onClick={() =>
                              setExpandedCase((prev) => (prev === c.id ? null : c.id))
                            }
                          >
                            {expandedCase === c.id
                              ? t("ai.hideResolution")
                              : t("ai.viewResolution")}
                          </button>

                          {expandedCase === c.id && (
                            <p className="mt-1 rounded-md bg-zinc-50 p-2 text-[11px] leading-relaxed text-zinc-700">
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
