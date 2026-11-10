import { useTranslation } from "react-i18next";
import { Drawer, EmptyState, Skeleton, SourceList } from "@kairo/ui";
import { formatDate } from "@/lib/date-format";

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

function formatSimilarity(value: number | null): string | null {
  return value === null ? null : `${Math.round(value * 100)}%`;
}

interface RelatedHistoryDrawerProps {
  open:      boolean;
  loading:   boolean;
  items:     RelatedHistoryItem[];
  onClose:   () => void;
  onSelectTicket: (id: string) => void;
}

export function RelatedHistoryDrawer({ open, loading, items, onClose, onSelectTicket }: RelatedHistoryDrawerProps) {
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
            title: item.subject ?? `${t("relatedHistory.resolvedOn")} ${formatDate(item.resolved_at)}`,
            meta: formatSimilarity(item.similarity) ?? undefined,
            onOpen: () => onSelectTicket(item.id),
          }))}
        />
      )}
    </Drawer>
  );
}
