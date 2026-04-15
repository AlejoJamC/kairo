import { useState } from "react";
import { useTriageStore, type Ticket } from "@/stores/triage-store";
import { apiCall } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { RefreshCw } from "lucide-react";

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const PRIORITY_CLASSES: Record<string, string> = {
  P1: "bg-red-50 text-red-700 border border-red-200",
  P2: "bg-amber-50 text-amber-700 border border-amber-200",
  P3: "bg-gray-100 text-gray-600 border border-gray-300",
};

const TYPE_CLASSES: Record<string, string> = {
  support: "bg-blue-50 text-blue-700 border border-blue-200",
  lead: "bg-green-50 text-green-700 border border-green-200",
  spam: "bg-zinc-100 text-zinc-600 border border-zinc-300",
};

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
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-2 py-0.5 text-[10px] font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white"
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
  tipo: string;
  prioridad: string;
  categoria: string;
  sentimiento: string;
  razonamiento: string;
  confianza: number;
}

interface BatchTicketResult {
  ticket_id: string;
  status: "success" | "skipped" | "protected" | "failed";
  reason?: string;
  classification?: ClassificationResult;
}

// ---------------------------------------------------------------------------
// TicketList
// ---------------------------------------------------------------------------

export function TicketList() {
  const { tickets, selectedTicketId, isScanning, classifiedCount, selectTicket, updateClassification } =
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
      const res = await apiCall("/v1/tickets/classify-batch", {
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
        // Update store directly from results
        const results = data.results as BatchTicketResult[];
        setClassifyProgress(`${data.processed} / ${data.total} classified`);
        for (const r of results) {
          if (r.status === "success" && r.classification) {
            updateClassification(r.ticket_id, {
              ticket_type: r.classification.tipo,
              priority: r.classification.prioridad,
              category: r.classification.categoria,
              sentiment: r.classification.sentimiento,
              ai_reasoning: r.classification.razonamiento,
              classification_confidence: r.classification.confianza,
              classified_at: new Date().toISOString(),
            });
          }
        }
      } else {
        // Async path: poll batch_classify_jobs table until completed
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
    // batch_classify_jobs is not yet in the generated schema — cast to any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any;
    return new Promise((resolve) => {
      let attempts = 0;
      const MAX_ATTEMPTS = 60; // 2 min at 2s interval

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
        <h2 className="text-sm font-semibold text-zinc-900">Tickets</h2>
        <span className="text-xs text-zinc-500">
          {classifiedCount}/{tickets.length}
        </span>
      </div>

      {/* Filter controls */}
      <div className="flex flex-wrap gap-1 border-b px-3 py-2">
        {(["P1", "P2", "P3"] as const).map((p) => (
          <FilterChip
            key={p}
            label={p}
            active={filters.priority === p}
            onClick={() => toggleFilter("priority", p)}
          />
        ))}
        <span className="w-px bg-zinc-200" />
        {(["support", "lead", "spam"] as const).map((t) => (
          <FilterChip
            key={t}
            label={t}
            active={filters.type === t}
            onClick={() => toggleFilter("type", t)}
          />
        ))}
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
            label={s}
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
            {classifyingAll ? (classifyProgress ?? "Classifying...") : "Classify All"}
          </button>
        </div>
      )}

      {/* Scanning banner when tickets exist */}
      {isScanning && tickets.length > 0 && (
        <div className="border-b bg-blue-50 px-4 py-2 text-xs text-blue-700">
          Scanning emails... {classifiedCount} ticket{classifiedCount !== 1 ? "s" : ""} classified
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
              <p className="text-sm text-zinc-500">No tickets yet.</p>
              <p className="text-xs text-zinc-400">Checking your recent emails...</p>
            </>
          ) : (
            <p className="text-sm text-zinc-500">No tickets match the current filters.</p>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filtered.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => selectTicket(ticket.id)}
              className={`flex w-full flex-col border-b px-4 py-3 text-left transition-colors duration-150 ${
                selectedTicketId === ticket.id ? "bg-zinc-50" : "hover:bg-gray-50"
              }`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-zinc-900">
                  {ticket.from_name ?? ticket.from_email ?? "Unknown"}
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  {ticket.ticket_type && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        TYPE_CLASSES[ticket.ticket_type] ?? "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {ticket.ticket_type}
                    </span>
                  )}
                  {ticket.priority && (
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        PRIORITY_CLASSES[ticket.priority] ?? "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {ticket.priority}
                    </span>
                  )}
                </div>
              </div>
              <p className="truncate text-xs text-zinc-700">{ticket.subject}</p>
              <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{ticket.snippet}</p>
              <p className="mt-1 text-[10px] text-zinc-400">
                {ticket.received_at ? new Date(ticket.received_at).toLocaleString() : ""}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
