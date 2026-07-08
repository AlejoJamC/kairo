import { useRef, useState, useEffect, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, RefreshCw } from "lucide-react";
import { useTriageStore, type Ticket } from "@/stores/triage-store";
import { TicketCard } from "@/components/ticket-card";
import { apiCall } from "@/lib/api-client";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/auth-context";

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

// Statuses that are NOT part of the active triage queue: awaiting the customer,
// or closed. They live in their own views, so they must leave the main triage
// list (and its count) the moment a reply/resolve updates the store.
const NON_TRIAGE_STATUSES = new Set(["awaiting_customer", "resolved", "auto_resolved"]);

export function isTriageActive(status: string | null | undefined): boolean {
  return !NON_TRIAGE_STATUSES.has(status ?? "");
}

function applyFilters(tickets: Ticket[], f: FilterState): Ticket[] {
  return tickets.filter((t) => {
    if (!isTriageActive(t.status)) return false;
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
// KAI-24 — AI similarity row (raw find_similar_tickets RPC row, keyed
// ticket_id, not id). Backend already filters by similarity >= 0.85.
// ---------------------------------------------------------------------------

interface SimilarTicketRow {
  ticket_id: string;
  subject: string | null;
  similarity: number | null;
}

// KAI-24 — group name is a backend-only field (not shown anywhere in the
// dashboard UI today), so it isn't run through i18n like user-facing labels.
function deriveGroupName(subject: string | null | undefined): string {
  const trimmed = (subject ?? "").trim();
  if (trimmed) return trimmed.slice(0, 60);
  return `Grupo ${new Date().toISOString().slice(0, 10)}`;
}

async function createGroupAndAssign(ticketIds: string[], name: string): Promise<string> {
  const createRes = await apiCall("/api/v1/ticket-groups", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  if (!createRes.ok) throw new Error("Failed to create group");
  const group = (await createRes.json()) as { id: string };

  const assignRes = await apiCall(`/api/v1/ticket-groups/${group.id}/tickets`, {
    method: "POST",
    body: JSON.stringify({ ticket_ids: ticketIds }),
  });
  if (!assignRes.ok) throw new Error("Failed to assign tickets to group");

  return group.id;
}

// ---------------------------------------------------------------------------
// Virtualized ticket list — used when filtered count > 50
// ---------------------------------------------------------------------------

const ITEM_HEIGHT = 100;

function VirtualTicketList({
  tickets,
  selectedTicketId,
  correctedTicketIds,
  groupCounts,
  onSelect,
  selectedTicketIds,
  onToggleSelect,
}: {
  tickets: Ticket[];
  selectedTicketId: string | null;
  correctedTicketIds: Set<string>;
  groupCounts: Map<string, number>;
  onSelect: (id: string) => void;
  selectedTicketIds: Set<string>;
  onToggleSelect: (id: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: tickets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  });

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto" style={{ minHeight: 0, paddingBottom: 8 }}>
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
                groupCount={ticket.group_id ? (groupCounts.get(ticket.group_id) ?? 1) : 0}
                multiSelectMode={selectedTicketIds.size > 0}
                isChecked={selectedTicketIds.has(ticket.id)}
                onToggleSelect={onToggleSelect}
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
  const { user, accountId } = useAuth();
  const {
    tickets,
    selectedTicketId,
    isScanning,
    classifiedCount,
    selectTicket,
    updateClassification,
    correctedTicketIds,
    setTickets,
    selectedTicketIds,
    toggleTicketSelection,
    clearTicketSelection,
    setTicketsGroup,
    dismissedSimilarTicketIds,
    dismissSimilarSuggestion,
  } = useTriageStore();
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [classifyingAll, setClassifyingAll] = useState(false);
  const [classifyProgress, setClassifyProgress] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; skipped: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // KAI-24 — manual grouping (action bar) + AI similarity callout state.
  const [grouping, setGrouping] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [similarTickets, setSimilarTickets] = useState<SimilarTicketRow[] | null>(null);
  const [groupingSimilar, setGroupingSimilar] = useState(false);

  const filtered = applyFilters(tickets, filters);

  // Header count reflects the active triage queue (excludes awaiting/resolved),
  // so it always matches the list instead of the raw store total.
  const activeTickets = tickets.filter((t) => isTriageActive(t.status));
  const activeClassifiedCount = activeTickets.filter((t) => t.classified_at !== null).length;

  // Count how many tickets share each group_id (for "similares agrupados" label)
  const groupCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tickets) {
      if (t.group_id) counts.set(t.group_id, (counts.get(t.group_id) ?? 0) + 1);
    }
    return counts;
  }, [tickets]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  function toggleFilter<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    setFilters((prev) => ({ ...prev, [key]: prev[key] === value ? null : value }));
  }

  // -------------------------------------------------------------------------
  // KAI-24 — AI similarity suggestion: fetch when the opened ticket changes.
  // Guards against races (a slow response for a previously-open ticket must
  // not clobber the callout for the one now open) and skips entirely once
  // the suggestion for that ticket id was dismissed this session.
  // -------------------------------------------------------------------------

  useEffect(() => {
    setSimilarTickets(null);
    if (!selectedTicketId || dismissedSimilarTicketIds.has(selectedTicketId)) return;

    let cancelled = false;

    apiCall(`/api/v1/tickets/${selectedTicketId}/similar`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { data?: SimilarTicketRow[]; degraded?: boolean } | null) => {
        if (cancelled || !body || body.degraded || !body.data || body.data.length === 0) return;
        setSimilarTickets(body.data);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [selectedTicketId, dismissedSimilarTicketIds]);

  // -------------------------------------------------------------------------
  // KAI-24 — Manual grouping (action bar) + AI similarity suggestion accept
  // -------------------------------------------------------------------------

  async function handleGroupSelected() {
    if (grouping || selectedTicketIds.size < 2) return;
    setGroupError(null);
    setGrouping(true);
    try {
      const ids = Array.from(selectedTicketIds);
      const first = tickets.find((t) => t.id === ids[0]);
      const groupId = await createGroupAndAssign(ids, deriveGroupName(first?.subject));
      setTicketsGroup(ids, groupId);
      clearTicketSelection();
    } catch {
      setGroupError(t("ticketList.groupError", "No se pudo agrupar los tickets. Intenta de nuevo."));
    } finally {
      setGrouping(false);
    }
  }

  async function handleAcceptSimilar() {
    if (!selectedTicketId || !similarTickets || groupingSimilar) return;
    setGroupError(null);
    setGroupingSimilar(true);
    try {
      const current = tickets.find((t) => t.id === selectedTicketId);
      const ids = [selectedTicketId, ...similarTickets.map((s) => s.ticket_id)];
      const groupId = await createGroupAndAssign(ids, deriveGroupName(current?.subject));
      setTicketsGroup(ids, groupId);
      setSimilarTickets(null);
    } catch {
      setGroupError(t("ticketList.groupError", "No se pudo agrupar los tickets. Intenta de nuevo."));
    } finally {
      setGroupingSimilar(false);
    }
  }

  function handleDismissSimilar() {
    if (!selectedTicketId) return;
    dismissSimilarSuggestion(selectedTicketId);
    setSimilarTickets(null);
  }

  // -------------------------------------------------------------------------
  // Sync Gmail
  // -------------------------------------------------------------------------

  async function handleSyncGmail() {
    if (syncing || !user || !accountId) return;
    setMenuOpen(false);
    setSyncing(true);
    setSyncResult(null);
    setSyncError(null);

    try {
      const res = await apiCall("/bff/gmail/sync", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { error?: string }).error ?? t("ticketList.syncError", "Sync failed");
        setSyncError(msg);
        return;
      }
      const data = await res.json() as { summary?: { created: number; skipped: number } };
      if (data.summary) setSyncResult(data.summary);

      // Re-fetch to reflect new tickets
      const supabase = createClient();
      const { data: fresh } = await supabase
        .from("tickets")
        .select("*")
        .eq("account_id", accountId!)
        .not("status", "in", "(awaiting_customer,resolved,auto_resolved)")
        .order("priority_score", { ascending: false, nullsFirst: false })
        .limit(200);
      if (fresh) setTickets(fresh as Ticket[]);
    } catch {
      setSyncError(t("ticketList.syncError", "Sync failed"));
    } finally {
      setSyncing(false);
    }
  }

  // -------------------------------------------------------------------------
  // Classify All
  // -------------------------------------------------------------------------

  async function handleClassifyAll() {
    if (classifyingAll || tickets.length === 0) return;
    setMenuOpen(false);
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

  const busy = classifyingAll || syncing;

  return (
    <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden", background: "white" }}>
      {/* Header */}
      <div style={{ padding: "12px 14px 8px", borderBottom: "1px solid var(--k-border-subtle)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
            <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--k-text-primary)" }}>
              {t("ticketList.header")}
            </span>
            <span style={{ fontSize: 12, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)" }}>
              {activeClassifiedCount}/{activeTickets.length}
            </span>
          </div>

          {/* ⋯ actions dropdown */}
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              disabled={busy}
              aria-label={t("ticketList.moreActions", "Más acciones")}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 28,
                height: 28,
                borderRadius: 6,
                border: "1px solid var(--k-border)",
                background: menuOpen ? "var(--k-surface-2)" : "white",
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.5 : 1,
                color: "var(--k-text-secondary)",
              }}
            >
              {busy
                ? <RefreshCw style={{ width: 13, height: 13 }} className="animate-spin" />
                : <MoreHorizontal style={{ width: 15, height: 15 }} />}
            </button>

            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 4px)",
                  right: 0,
                  zIndex: 50,
                  background: "white",
                  border: "1px solid var(--k-border)",
                  borderRadius: 8,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
                  minWidth: 180,
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={handleSyncGmail}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "9px 14px",
                    fontSize: 13,
                    color: "var(--k-text-primary)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--k-surface)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  <RefreshCw style={{ width: 13, height: 13, color: "var(--k-text-tertiary)", flexShrink: 0 }} />
                  {t("ticketList.syncGmail", "Sincronizar Gmail")}
                </button>

                <div style={{ height: 1, background: "var(--k-border-subtle)", margin: "0 10px" }} />

                <button
                  onClick={handleClassifyAll}
                  disabled={tickets.length === 0}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "9px 14px",
                    fontSize: 13,
                    color: tickets.length === 0 ? "var(--k-text-tertiary)" : "var(--k-text-primary)",
                    background: "none",
                    border: "none",
                    cursor: tickets.length === 0 ? "not-allowed" : "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => { if (tickets.length > 0) e.currentTarget.style.background = "var(--k-surface)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                >
                  <RefreshCw style={{ width: 13, height: 13, color: "var(--k-text-tertiary)", flexShrink: 0 }} />
                  {classifyingAll
                    ? (classifyProgress ?? t("ticketList.classifying"))
                    : t("ticketList.classifyAll")}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ display: "flex", gap: 4 }}>
          <FilterChip
            label={t("ticketList.filterAll", "Todos")}
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

      {/* KAI-24 — multi-select action bar */}
      {selectedTicketIds.size >= 2 && (
        <div style={{
          borderBottom: "1px solid var(--k-border-subtle)",
          background: "var(--k-accent-subtle)",
          padding: "6px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}>
          <span style={{ fontSize: 11, fontFamily: "var(--k-font-mono)", color: "var(--k-accent)" }}>
            {t("ticketList.selectedCount", { count: selectedTicketIds.size })}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={handleGroupSelected}
              disabled={grouping}
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "3px 8px",
                borderRadius: 4,
                background: "var(--k-accent)",
                color: "white",
                border: "none",
                cursor: grouping ? "not-allowed" : "pointer",
                opacity: grouping ? 0.6 : 1,
              }}
            >
              {grouping ? t("ticketList.grouping", "Agrupando...") : t("ticketList.groupSelected")}
            </button>
            <button
              onClick={clearTicketSelection}
              disabled={grouping}
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "3px 8px",
                borderRadius: 4,
                background: "transparent",
                color: "var(--k-text-secondary)",
                border: "1px solid var(--k-border)",
                cursor: grouping ? "not-allowed" : "pointer",
              }}
            >
              {t("ticketList.cancelSelection")}
            </button>
          </div>
        </div>
      )}

      {/* KAI-24 — grouping error banner (manual selection or AI-suggested) */}
      {groupError && (
        <div style={{
          borderBottom: "1px solid var(--k-border-subtle)",
          background: "#FEF2F2",
          padding: "5px 14px",
          fontSize: 11,
          fontFamily: "var(--k-font-mono)",
          color: "#991B1B",
        }}>
          {groupError}
        </div>
      )}

      {/* KAI-24 — AI similarity suggestion callout */}
      {similarTickets && similarTickets.length > 0 && (
        <div style={{
          borderBottom: "1px solid var(--k-border-subtle)",
          background: "var(--k-accent-subtle)",
          padding: "8px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}>
          <span style={{ fontSize: 12, color: "var(--k-accent)" }}>
            {t("ticketList.similarSuggestion", { count: similarTickets.length })}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onClick={handleAcceptSimilar}
              disabled={groupingSimilar}
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "3px 8px",
                borderRadius: 4,
                background: "var(--k-accent)",
                color: "white",
                border: "none",
                cursor: groupingSimilar ? "not-allowed" : "pointer",
                opacity: groupingSimilar ? 0.6 : 1,
              }}
            >
              {groupingSimilar ? t("ticketList.grouping", "Agrupando...") : t("ticketList.similarAccept")}
            </button>
            <button
              onClick={handleDismissSimilar}
              disabled={groupingSimilar}
              style={{
                fontSize: 11,
                fontWeight: 500,
                padding: "3px 8px",
                borderRadius: 4,
                background: "transparent",
                color: "var(--k-text-secondary)",
                border: "1px solid var(--k-border)",
                cursor: groupingSimilar ? "not-allowed" : "pointer",
              }}
            >
              {t("ticketList.similarDismiss")}
            </button>
          </div>
        </div>
      )}

      {/* Sync result / error banner */}
      {syncResult && (
        <div style={{
          borderBottom: "1px solid var(--k-border-subtle)",
          background: "#ECFDF5",
          padding: "5px 14px",
          fontSize: 11,
          fontFamily: "var(--k-font-mono)",
          color: "#065F46",
        }}>
          {t("ticketList.syncSuccess", "{{created}} nuevos · {{skipped}} omitidos", {
            created: syncResult.created,
            skipped: syncResult.skipped,
          })}
        </div>
      )}
      {syncError && (
        <div style={{
          borderBottom: "1px solid var(--k-border-subtle)",
          background: "#FEF2F2",
          padding: "5px 14px",
          fontSize: 11,
          fontFamily: "var(--k-font-mono)",
          color: "#991B1B",
        }}>
          {syncError}
        </div>
      )}

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
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 8 }}>
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
          groupCounts={groupCounts}
          onSelect={selectTicket}
          selectedTicketIds={selectedTicketIds}
          onToggleSelect={toggleTicketSelection}
        />
      ) : (
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: 8 }}>
          {filtered.map((ticket) => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              selected={selectedTicketId === ticket.id}
              onSelect={selectTicket}
              isCorrected={correctedTicketIds.has(ticket.id)}
              groupCount={ticket.group_id ? (groupCounts.get(ticket.group_id) ?? 1) : 0}
              multiSelectMode={selectedTicketIds.size > 0}
              isChecked={selectedTicketIds.has(ticket.id)}
              onToggleSelect={toggleTicketSelection}
            />
          ))}
        </div>
      )}
    </div>
  );
}
