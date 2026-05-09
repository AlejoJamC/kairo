import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { useTriageStore, type Ticket } from "@/stores/triage-store";
import { TicketCard } from "@/components/ticket-card";
import { apiCall } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { RefreshCw } from "lucide-react";

// ---------------------------------------------------------------------------
// Skeleton placeholder
// ---------------------------------------------------------------------------

function TicketSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, borderBottom: "1px solid var(--k-border-subtle)", padding: "12px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div className="shimmer" style={{ height: 11, width: 128 }} />
        <div className="shimmer" style={{ height: 11, width: 32 }} />
      </div>
      <div className="shimmer" style={{ height: 10, width: "100%" }} />
      <div className="shimmer" style={{ height: 8, width: "75%" }} />
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
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11,
        padding: "4px 8px",
        borderRadius: 4,
        background: active ? "var(--k-surface-2)" : "transparent",
        color: active ? "var(--k-text-primary)" : "var(--k-text-tertiary)",
        fontFamily: "var(--k-font-mono)",
        cursor: "pointer",
        border: "none",
        transition: "background 0.1s ease, color 0.1s ease",
      }}
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
    <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden", background: "white" }}>
      {/* Header */}
      <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid var(--k-border-subtle)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--k-text-primary)" }}>
                {t("ticketList.header")}
              </span>
              <span style={{ fontSize: 12, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)" }}>
                {classifiedCount}/{tickets.length}
              </span>
            </div>
          </div>

          {tickets.length > 0 && (
            <button
              onClick={handleClassifyAll}
              disabled={classifyingAll}
              style={{
                fontSize: 11,
                padding: "5px 9px",
                borderRadius: 5,
                border: "1px solid var(--k-border)",
                color: "var(--k-text-secondary)",
                display: "flex",
                alignItems: "center",
                gap: 4,
                fontFamily: "var(--k-font-mono)",
                background: "white",
                cursor: classifyingAll ? "not-allowed" : "pointer",
                opacity: classifyingAll ? 0.5 : 1,
              }}
            >
              <RefreshCw style={{ width: 11, height: 11 }} className={classifyingAll ? "animate-spin" : ""} />
              {classifyingAll
                ? (classifyProgress ?? t("ticketList.classifying"))
                : t("ticketList.classifyAll")}
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div style={{ display: "flex", gap: 4 }}>
          <FilterChip
            label="Todos"
            active={filters.priority === null && filters.type === null}
            onClick={() => setFilters(INITIAL_FILTERS)}
          />
          {(["P1", "P2", "P3"] as const).map((p) => (
            <FilterChip
              key={p}
              label={p}
              active={filters.priority === p}
              onClick={() => toggleFilter("priority", p)}
            />
          ))}
        </div>
      </div>

      {/* Scanning banner */}
      {isScanning && tickets.length > 0 && (
        <div style={{
          borderBottom: "1px solid var(--k-border-subtle)",
          background: "var(--k-accent-subtle)",
          padding: "6px 14px",
          fontSize: 11,
          fontFamily: "var(--k-font-mono)",
          color: "var(--k-accent)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--k-accent)", display: "inline-block" }} className="animate-pulse" />
          {t("ticketList.scanning", { count: classifiedCount })}
        </div>
      )}

      {/* Skeleton while scanning with no tickets */}
      {isScanning && tickets.length === 0 ? (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <TicketSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, padding: 32, textAlign: "center" }}>
          {tickets.length === 0 ? (
            <>
              <p style={{ fontSize: 13, color: "var(--k-text-secondary)" }}>{t("ticketList.noTickets")}</p>
              <p style={{ fontSize: 12, color: "var(--k-text-tertiary)" }}>{t("ticketList.checkingEmails")}</p>
            </>
          ) : (
            <p style={{ fontSize: 13, color: "var(--k-text-secondary)" }}>{t("ticketList.noMatch")}</p>
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
        <div style={{ flex: 1, overflowY: "auto" }}>
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
