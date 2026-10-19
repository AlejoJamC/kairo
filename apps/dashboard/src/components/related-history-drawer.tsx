import { useTranslation } from "react-i18next";
import { Drawer, EmptyState, Skeleton, SourceList } from "@kairo/ui";

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
        <SourceList
          title={t("relatedHistory.title")}
          items={items.slice(0, 3).map((item) => ({
            id: item.id,
            kind: "similar" as const,
            code: t("relatedHistory.ticketNumber", { number: item.ticket_number }),
            title: item.subject ?? `${t("relatedHistory.resolvedOn")} ${formatResolvedDate(item.resolved_at, lang)}`,
            meta: formatSimilarity(item.similarity) ?? undefined,
            onOpen: () => onSelectTicket(item.id),
          }))}
        />
      )}
    </Drawer>
  );
}
