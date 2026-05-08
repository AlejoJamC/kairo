import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { useTriageStore, type Ticket } from "@/stores/triage-store";
import { TicketCard } from "@/components/ticket-card";
import { getPriorityTokens, getTicketTypeTokens } from "@kairo/ui";
import { apiCall } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { RefreshCw } from "lucide-react";

// ---------------------------------------------------------------------------
// Skeleton placeholder
// ---------------------------------------------------------------------------

function TicketSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-2 border-b px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="h-3 w-32 rounded bg-zinc-200" />
        <div className="h-3 w-8 rounded bg-zinc-200" />
      </div>
      <div className="h-2.5 w-full rounded bg-zinc-100" />
      <div className="h-2 w-3/4 rounded bg-zinc-100" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

interface FilterState {
  priority: string | null;
  type: string | null;
  category: string | null;
  status: "classified" | "unclassified" | null;
}

const INITIAL_FILTERS: FilterState = {
  priority: null,
  type: null,
  category: null,
  status: null,
};

function applyFilters(tickets: Ticket[], f: FilterState): Ticket[] {
  return tickets.filter((t) => {
    if (f.priority && t.priority !== f.priority) return false;
    if (f.type && t.ticket_type !== f.type) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.status === "classified" && !t.classified_at) return false;
    if (f.status === "unclassified" && t.classified_at) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// FilterChip — small toggle button
// ---------------------------------------------------------------------------

function FilterChip({
  label,
  active,
  onClick,
  activeClass,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  activeClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
        active
          ? (activeClass ?? "bg-blue-600 text-white")
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// BatchTicketResult (mirrors API schema)
// ---------------------------------------------------------------------------

interface ClassificationResult {
  type: string;
  priority: string;
  category: string;
  tone: string;
  reasoning: string;
  confidence: number;
}

interface BatchTicketResult {
  ticket_id: string;
  status: "success" | "skipped" | "protected" | "failed";
  reason?: string;
  classification?: ClassificationResult;
}

// ---------------------------------------------------------------------------
// Virtualized ticket list — used when filtered count > 50
// ---------------------------------------------------------------------------

const ITEM_HEIGHT = 100; // px — approximate height of TicketCard

function VirtualTicketList({
  tickets,
  selectedTicketId,
  correctedTicketIds,
  onSelect,
}: {
  tickets: Ticket[];
  selectedTicketId: string | null;
  correctedTicketIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: tickets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const ticket = tickets[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <TicketCard
                ticket={ticket}
                selected={selectedTicketId === ticket.id}
                onSelect={onSelect}
                isCorrected={correctedTicketIds.has(ticket.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TicketList
// ---------------------------------------------------------------------------

const VIRTUALIZE_THRESHOLD = 50;

export function TicketList() {
  const { t } = useTranslation("dashboard");
  const { tickets, selectedTicketId, isScanning, classifiedCount, selectTicket, updateClassification, correctedTicketIds } =
    useTriageStore();
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [classifyingAll, setClassifyingAll] = useState(false);
  const [classifyProgress, setClassifyProgress] = useState<string | null>(null);

  const filtered = applyFilters(tickets, filters);

  function toggleFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: prev[key] === value ? null : value }));
  }

  // -------------------------------------------------------------------------
  // Classify All
  // -------------------------------------------------------------------------

  async function handleClassifyAll() {
    if (classifyingAll || tickets.length === 0) return;
    setClassifyingAll(true);
    setClassifyProgress("Starting...");

    try {
      const ids = tickets.map((t) => t.id);
      const res = await apiCall("/api/v1/tickets/classify-batch", {
        method: "POST",
        body: JSON.stringify({ ticket_ids: ids, force_reclassify: false }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[classify-all] API error:", body);
        return;
      }

      const data = await res.json();

      if (data.mode === "sync") {
        const results = data.results as BatchTicketResult[];
        setClassifyProgress(`${data.processed} / ${data.total} classified`);
        for (const r of results) {
          if (r.status === "success" && r.classification) {
            updateClassification(r.ticket_id, {
              ticket_type: r.classification.type,
              priority: r.classification.priority,
              category: r.classification.category,
              sentiment: r.classification.tone,
              ai_reasoning: r.classification.reasoning,
              classification_confidence: r.classification.confidence,
              classified_at: new Date().toISOString(),
            });
          }
        }
      } else {
        const jobId = data.job_id as string;
        setClassifyProgress(`Queued (${data.total} tickets)...`);
        await pollJobStatus(jobId);
      }
    } catch (err) {
      console.error("[classify-all]", err);
    } finally {
      setClassifyingAll(false);
      setClassifyProgress(null);
    }
  }

  async function pollJobStatus(jobId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any;
    return new Promise((resolve) => {
      let attempts = 0;
      const MAX_ATTEMPTS = 60;

      const tick = async () => {
        attempts++;
        const { data } = await supabase
          .from("batch_classify_jobs")
          .select("status, processed, total")
          .eq("id", jobId)
          .single();

        const row = data as { status: string; processed: number; total: number } | null;

        if (row?.status === "completed") {
          setClassifyProgress(`${row.processed} / ${row.total} classified`);
          resolve();
          return;
        }

        if (row?.status === "failed" || attempts >= MAX_ATTEMPTS) {
          resolve();
          return;
        }

        if (row?.processed !== undefined) {
          setClassifyProgress(`${row.processed} / ${row.total} classifying...`);
        }

        setTimeout(tick, 2000);
      };

      setTimeout(tick, 2000);
    });
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">{t("ticketList.header")}</h2>
        <span className="text-xs text-zinc-500">
          {classifiedCount}/{tickets.length}
        </span>
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap gap-1 border-b px-3 py-2">
        {(["P1", "P2", "P3", "P4"] as const).map((p) => {
          const tok = getPriorityTokens(p);
          return (
            <FilterChip
              key={p}
              label={p}
              active={filters.priority === p}
              onClick={() => toggleFilter("priority", p)}
              activeClass={tok ? `${tok.badgeBg} ${tok.badgeText} border ${tok.badgeBorder}` : undefined}
            />
          );
        })}
        <span className="w-px bg-zinc-200" />
        {(["support", "prospect", "spam", "other"] as const).map((tp) => {
          const tok = getTicketTypeTokens(tp);
          return (
            <FilterChip
              key={tp}
              label={tp}
              active={filters.type === tp}
              onClick={() => toggleFilter("type", tp)}
              activeClass={`${tok.badgeBg} ${tok.badgeText} border ${tok.badgeBorder}`}
            />
          );
        })}
        <span className="w-px bg-zinc-200" />
        {(["technical", "billing", "sales", "other"] as const).map((c) => (
          <FilterChip
            key={c}
            label={c}
            active={filters.category === c}
            onClick={() => toggleFilter("category", c)}
          />
        ))}
        <span className="w-px bg-zinc-200" />
        {(["classified", "unclassified"] as const).map((s) => (
          <FilterChip
            key={s}
            label={t(`ticketList.${s}`)}
            active={filters.status === s}
            onClick={() => toggleFilter("status", s)}
          />
        ))}
      </div>

      {/* Classify All button */}
      {tickets.length > 0 && (
        <div className="border-b px-3 py-2">
          <button
            onClick={handleClassifyAll}
            disabled={classifyingAll}
            className="flex items-center gap-1.5 rounded-md bg-zinc-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-3 w-3 ${classifyingAll ? "animate-spin" : ""}`} />
            {classifyingAll
              ? (classifyProgress ?? t("ticketList.classifying"))
              : t("ticketList.classifyAll")}
          </button>
        </div>
      )}

      {/* Scanning banner */}
      {isScanning && tickets.length > 0 && (
        <div className="border-b bg-blue-50 px-4 py-2 text-xs text-blue-700">
          {t("ticketList.scanning", { count: classifiedCount })}
        </div>
      )}

      {/* Skeleton while scanning with no tickets */}
      {isScanning && tickets.length === 0 ? (
        <div className="flex-1 overflow-y-auto">
          {Array.from({ length: 6 }).map((_, i) => (
            <TicketSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          {tickets.length === 0 ? (
            <>
              <p className="text-sm text-zinc-500">{t("ticketList.noTickets")}</p>
              <p className="text-xs text-zinc-400">{t("ticketList.checkingEmails")}</p>
            </>
          ) : (
            <p className="text-sm text-zinc-500">{t("ticketList.noMatch")}</p>
          )}
        </div>
      ) : filtered.length > VIRTUALIZE_THRESHOLD ? (
        <VirtualTicketList
          tickets={filtered}
          selectedTicketId={selectedTicketId}
          correctedTicketIds={correctedTicketIds}
          onSelect={selectTicket}
        />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filtered.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              selected={selectedTicketId === ticket.id}
              onSelect={selectTicket}
              isCorrected={correctedTicketIds.has(ticket.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
