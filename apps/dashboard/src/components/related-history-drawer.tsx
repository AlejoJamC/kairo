import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

// ---------------------------------------------------------------------------
// KAI-25 — historical context drawer: up to 3 past RESOLVED tickets related
// to the currently selected ticket. Slides in from the edge of the ticket
// list (left: 360, matching the list's fixed width — see inbox.tsx) so the
// list itself stays visible and interactive, unlike a full-screen modal.
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

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, left: 360, zIndex: 30, background: "rgba(0,0,0,0.2)" }}
      />
      <div
        role="dialog"
        aria-label={t("relatedHistory.title")}
        style={{
          position: "fixed", top: 0, bottom: 0, left: 360, zIndex: 40,
          width: 380, background: "white", boxShadow: "4px 0 16px rgba(9,9,11,0.08)",
          overflowY: "auto", display: "flex", flexDirection: "column",
          borderRight: "1px solid var(--k-border)",
        }}
      >
        <div
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "16px 18px", borderBottom: "1px solid var(--k-border-subtle)",
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--k-text-primary)" }}>
            {t("relatedHistory.title")}
          </span>
          <button
            onClick={onClose}
            aria-label={t("relatedHistory.close")}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 26, height: 26, borderRadius: 6, border: "none",
              background: "none", cursor: "pointer", color: "var(--k-text-tertiary)",
            }}
          >
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        <div style={{ flex: 1, padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          {loading ? (
            <>
              <div className="shimmer" style={{ height: 84, borderRadius: 8 }} />
              <div className="shimmer" style={{ height: 84, borderRadius: 8 }} />
              <div className="shimmer" style={{ height: 84, borderRadius: 8 }} />
            </>
          ) : items.length === 0 ? (
            <p
              style={{
                fontSize: 13, color: "var(--k-text-tertiary)", fontStyle: "italic",
                margin: 0, textAlign: "center", padding: "24px 0",
              }}
            >
              {t("relatedHistory.empty")}
            </p>
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
                      <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 11, color: "#10B981", flexShrink: 0 }}>
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
        </div>
      </div>
    </>
  );
}
