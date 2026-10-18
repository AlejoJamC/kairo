import { useTranslation } from "react-i18next";
import { Drawer, EmptyState, Skeleton } from "@kairo/ui";

// ---------------------------------------------------------------------------
// Historical context drawer: up to 3 past RESOLVED tickets related to the
// currently selected ticket.
// ---------------------------------------------------------------------------

export interface RelatedHistoryItem {
  id:                 string;
  subject:            string | null;
  resolved_at:        string | null;
  resolution_summary: string | null;
  ticket_number:      number;
  similarity:         number | null;
}

function formatResolvedDate(iso: string | null, lang: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(lang === "en" ? "en-US" : "es-CO", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function formatSimilarity(value: number | null): string | null {
  return value === null ? null : `${Math.round(value * 100)}%`;
}

interface RelatedHistoryDrawerProps {
  open:      boolean;
  loading:   boolean;
  items:     RelatedHistoryItem[];
  lang:      string;
  onClose:   () => void;
  onSelectTicket: (id: string) => void;
}

export function RelatedHistoryDrawer({ open, loading, items, lang, onClose, onSelectTicket }: RelatedHistoryDrawerProps) {
  const { t } = useTranslation("dashboard");

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => { if (!next) onClose(); }}
      title={t("relatedHistory.title")}
      closeLabel={t("relatedHistory.close")}
    >
      {loading ? (
        <>
          <Skeleton height={84} borderRadius={8} />
          <Skeleton height={84} borderRadius={8} />
          <Skeleton height={84} borderRadius={8} />
        </>
      ) : items.length === 0 ? (
        <EmptyState title={t("relatedHistory.empty")} />
      ) : (
        items.slice(0, 3).map((item) => {
          const simLabel = formatSimilarity(item.similarity);
          return (
            <button
              key={item.id}
              onClick={() => onSelectTicket(item.id)}
              style={{
                display: "flex", flexDirection: "column", gap: 4, padding: 12,
                border: "1px solid var(--k-border)", borderRadius: 8,
                background: "white", cursor: "pointer", textAlign: "left",
                transition: "background 0.1s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--k-surface)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "white"; }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 11, color: "var(--k-text-tertiary)" }}>
                  {t("relatedHistory.ticketNumber", { number: item.ticket_number })}
                </span>
                {simLabel && (
                  <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 11, color: "var(--kairo-color-ok)", flexShrink: 0 }}>
                    {t("ai.similarity")}: {simLabel}
                  </span>
                )}
              </div>
              {item.subject && (
                <p style={{ fontSize: 13, fontWeight: 500, color: "var(--k-text-primary)", lineHeight: 1.35, margin: 0 }}>
                  {item.subject}
                </p>
              )}
              <p style={{ fontSize: 11, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", margin: 0 }}>
                {t("relatedHistory.resolvedOn")} {formatResolvedDate(item.resolved_at, lang)}
              </p>
            </button>
          );
        })
      )}
    </Drawer>
  );
}
