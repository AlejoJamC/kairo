import { useRef, useState, useEffect, useMemo } from "react";

import { useTranslation } from "react-i18next";
import { useTriageStore, pickPreferredGroupId } from "@kairo/client-core/stores/triage-store";
import { TicketCard } from "@/components/ticket-card";
import { RelatedHistoryDrawer, type RelatedHistoryItem } from "@/components/related-history-drawer";
import { TICKET_GROUPING_ENABLED } from "@/lib/feature-flags";
import { isTriageActive } from "@kairo/client-core/triage-status";
import { getSimilarTickets, getRelatedHistory, syncGmail, classifyBatch } from "@kairo/client-core/endpoints";
import { fetchTicketById, fetchInboxTickets, fetchBatchJobStatus } from "@kairo/client-core/queries";
import { useAuth } from "@kairo/client-core/auth";
import { Box, Button, Callout, EmptyState, Icon, IconButton, Menu, MenuItem, Popover, PopoverContent, PopoverTrigger, PriorityGlyph, PulseDot, Segmented, Spinner, Text } from "@kairo/ui";
import { TicketSkeleton, VirtualTicketList } from "@/components/ticket-list-parts";
import { INITIAL_FILTERS, applyFilters, assignToGroupOrCreate, deriveGroupName, type BatchTicketResult, type FilterState, type SimilarTicketRow } from "@/components/ticket-list-helpers";


// ---------------------------------------------------------------------------
// TicketList
// ---------------------------------------------------------------------------

const VIRTUALIZE_THRESHOLD = 50;

export function TicketList() {
  const { t, i18n } = useTranslation("dashboard");
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
    upsertTicket,
  } = useTriageStore();
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [classifyingAll, setClassifyingAll] = useState(false);
  const [classifyProgress, setClassifyProgress] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; skipped: number } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // KAI-24 — manual grouping (action bar) + AI similarity callout state.
  const [grouping, setGrouping] = useState(false);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [similarTickets, setSimilarTickets] = useState<SimilarTicketRow[] | null>(null);
  const [groupingSimilar, setGroupingSimilar] = useState(false);

  // KAI-108 — transient success feedback after any successful grouping
  // action (manual bar or callout accept). Auto-hides after ~4s; also
  // cleared when a new grouping action starts or the open ticket changes.
  const [groupSuccessCount, setGroupSuccessCount] = useState<number | null>(null);
  const groupSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearGroupSuccess() {
    if (groupSuccessTimeoutRef.current) {
      clearTimeout(groupSuccessTimeoutRef.current);
      groupSuccessTimeoutRef.current = null;
    }
    setGroupSuccessCount(null);
  }

  function showGroupSuccess(count: number) {
    if (groupSuccessTimeoutRef.current) clearTimeout(groupSuccessTimeoutRef.current);
    setGroupSuccessCount(count);
    groupSuccessTimeoutRef.current = setTimeout(() => {
      setGroupSuccessCount(null);
      groupSuccessTimeoutRef.current = null;
    }, 4000);
  }

  // Clear the success banner when the open ticket changes, and on unmount.
  useEffect(() => {
    clearGroupSuccess();
    return () => {
      if (groupSuccessTimeoutRef.current) clearTimeout(groupSuccessTimeoutRef.current);
    };
  }, [selectedTicketId]);

  // KAI-25 — historical context drawer: up to 3 past resolved tickets related
  // to the currently selected ticket.
  const [relatedHistory, setRelatedHistory] = useState<RelatedHistoryItem[]>([]);
  const [relatedHistoryLoading, setRelatedHistoryLoading] = useState(false);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);

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
    if (!TICKET_GROUPING_ENABLED) return;
    if (!selectedTicketId || dismissedSimilarTicketIds.has(selectedTicketId)) return;

    let cancelled = false;

    getSimilarTickets(selectedTicketId)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { data?: SimilarTicketRow[]; degraded?: boolean } | null) => {
        if (cancelled || !body || body.degraded || !body.data || body.data.length === 0) return;

        // KAI-108 GAP 2 — the /similar endpoint doesn't exclude tickets that
        // are already in the same group as the one currently open, so filter
        // those out client-side. Read fresh state via getState() (not the
        // `tickets` closure) so this effect doesn't need `tickets` in its
        // deps — that would refetch on every realtime ticket update — and
        // so the check always uses the group_id as of response time, not a
        // stale value captured when the fetch started.
        const state = useTriageStore.getState();
        const currentTicket = state.tickets.find((t) => t.id === selectedTicketId);
        const currentGroupId = currentTicket?.group_id ?? null;

        const filtered = currentGroupId
          ? body.data.filter((row) => {
              const t = state.tickets.find((x) => x.id === row.ticket_id);
              return !(t && t.group_id === currentGroupId);
            })
          : body.data;

        setSimilarTickets(filtered.length > 0 ? filtered : null);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [selectedTicketId, dismissedSimilarTicketIds]);

  // -------------------------------------------------------------------------
  // KAI-25 — historical context: fetch related (resolved) tickets whenever
  // the opened ticket changes. Same race-guard pattern as the similarity
  // effect above — a slow response for a previously-open ticket must not
  // clobber the drawer content for the one now open. Closes the drawer on
  // every ticket change so it never shows stale history for a new ticket.
  // -------------------------------------------------------------------------

  useEffect(() => {
    setRelatedHistory([]);
    setHistoryDrawerOpen(false);
    if (!selectedTicketId) return;

    let cancelled = false;
    setRelatedHistoryLoading(true);

    getRelatedHistory(selectedTicketId)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { data?: RelatedHistoryItem[] } | null) => {
        if (cancelled) return;
        setRelatedHistory(body?.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setRelatedHistory([]);
      })
      .finally(() => {
        if (!cancelled) setRelatedHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTicketId]);

  function handleOpenHistory() {
    setHistoryDrawerOpen(true);
  }

  // Historical tickets are resolved/ai_resolved, so inbox.tsx's initial
  // fetch never loads them into the store. Fetch the full row directly
  // (same pattern as inbox.tsx) and upsert it so TicketDetail can render it.
  // The list itself filters non-active statuses out via isTriageActive, so
  // this never shows up as a normal triage row.
  async function handleSelectHistoricalTicket(id: string) {
    setHistoryDrawerOpen(false);
    try {
      const ticket = await fetchTicketById(id);
      if (ticket) upsertTicket(ticket);
    } catch {
      // fall through — selectTicket still runs so at least the id is set
    }
    selectTicket(id);
  }

  // -------------------------------------------------------------------------
  // KAI-24 — Manual grouping (action bar) + AI similarity suggestion accept
  // -------------------------------------------------------------------------

  async function handleGroupSelected() {
    if (grouping || selectedTicketIds.size < 2) return;
    setGroupError(null);
    clearGroupSuccess();
    setGrouping(true);
    try {
      // Insertion order == list order for a Set built via toggleTicketSelection.
      const ids = Array.from(selectedTicketIds);
      const preferredGroupId = pickPreferredGroupId(tickets, ids);
      // KAI-108 GAP 1 — reuse an existing group instead of always creating a
      // new one. When some of the selected tickets already share a group,
      // only assign the ones that aren't in it yet (no redundant re-assign).
      const idsToAssign = preferredGroupId
        ? ids.filter((id) => tickets.find((t) => t.id === id)?.group_id !== preferredGroupId)
        : ids;
      const first = tickets.find((t) => t.id === ids[0]);
      const groupId = await assignToGroupOrCreate(idsToAssign, preferredGroupId, deriveGroupName(first?.subject));
      setTicketsGroup(ids, groupId);
      clearTicketSelection();
      showGroupSuccess(ids.length);
    } catch {
      setGroupError(t("ticketList.groupError", "No se pudo agrupar los tickets. Intenta de nuevo."));
    } finally {
      setGrouping(false);
    }
  }

  async function handleAcceptSimilar() {
    if (!selectedTicketId || !similarTickets || groupingSimilar) return;
    setGroupError(null);
    clearGroupSuccess();
    setGroupingSimilar(true);
    try {
      const current = tickets.find((t) => t.id === selectedTicketId);
      // KAI-108 GAP 1 — reuse the current ticket's existing group (if any)
      // instead of always creating a new one; this was the root cause of the
      // duplicate-group bug (repeated accepts kept spinning up fresh groups).
      const preferredGroupId = current?.group_id ?? null;
      const ids = [selectedTicketId, ...similarTickets.map((s) => s.ticket_id)];
      const idsToAssign = preferredGroupId
        ? ids.filter((id) => tickets.find((t) => t.id === id)?.group_id !== preferredGroupId)
        : ids;
      const groupId = await assignToGroupOrCreate(idsToAssign, preferredGroupId, deriveGroupName(current?.subject));
      setTicketsGroup(ids, groupId);
      setSimilarTickets(null);
      // KAI-108 GAP 5 — mark this ticket's suggestion as handled for the
      // session immediately, so the callout can't reappear before realtime
      // propagation catches up (the /similar backend doesn't exclude
      // same-group tickets yet).
      dismissSimilarSuggestion(selectedTicketId);
      showGroupSuccess(ids.length);
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
      const res = await syncGmail();
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as { error?: string }).error ?? t("ticketList.syncError", "Sync failed");
        setSyncError(msg);
        return;
      }
      const data = await res.json() as { summary?: { created: number; skipped: number } };
      if (data.summary) setSyncResult(data.summary);

      // Re-fetch to reflect new tickets
      const { data: fresh } = await fetchInboxTickets(accountId);
      if (fresh) setTickets(fresh);
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
      const res = await classifyBatch(ids);

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
    return new Promise((resolve) => {
      let attempts = 0;
      const MAX_ATTEMPTS = 60;

      const tick = async () => {
        attempts++;
        const row = await fetchBatchJobStatus(jobId);

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
    <Box display="flex" flexGrow={1} flexShrink={1} flexBasis="0%" flexDirection="column" overflow="hidden" backgroundColor="white">
      {/* Header */}
      <Box display="flex" alignItems="center" gap={8} minHeight={56} paddingTop={14} paddingRight={12} paddingLeft={20} flexShrink={0}>
        <Text tag="h1" fontSize={16} fontWeight={600} letterSpacing={-0.16} color="var(--k-text-primary)" margin={0}>
          {t("ticketList.header")}
        </Text>
        <Text fontSize={12} font="mono" color="var(--k-text-tertiary)">
          {activeClassifiedCount}/{activeTickets.length}
        </Text>
        <Box flexGrow={1} />
        <Button
          icon={busy ? <Spinner /> : <Icon name="spark" size={13} color="var(--kairo-color-accent)" />}
          disabled={busy || tickets.length === 0}
          onPress={handleClassifyAll}
        >
          {classifyingAll ? (classifyProgress ?? t("ticketList.classifying")) : t("ticketList.classify")}
        </Button>

        {/* ⋯ actions dropdown */}
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger>
            <IconButton label={t("ticketList.moreActions", "Más acciones")} disabled={busy}>
              <Icon name="more" size={15} color="var(--kairo-color-muted)" />
            </IconButton>
          </PopoverTrigger>
          <PopoverContent role="menu" label={t("ticketList.moreActions", "Más acciones")} align="end" width={220}>
            <Menu label={t("ticketList.moreActions", "Más acciones")}>
              <MenuItem icon={<Icon name="refresh" size={13} color="var(--kairo-color-faint)" />} label={t("ticketList.syncGmail", "Sincronizar Gmail")} onSelect={handleSyncGmail} />
            </Menu>
          </PopoverContent>
        </Popover>
      </Box>

      {/* Priority filters */}
      <Box paddingVertical={10} paddingHorizontal={14} borderBottomWidth={1} borderBottomColor="var(--k-border)" borderStyle="solid" flexShrink={0}>
        <Segmented
          variant="tabs"
          label={t("ticketList.filterLabel", "Filtrar por prioridad")}
          value={filters.priority === null && filters.type === null ? "all" : filters.priority ?? "all"}
          items={[
            { value: "all", label: t("ticketList.filterAll", "Todos"), count: activeTickets.length },
            ...(["P1", "P2", "P3"] as const).map((level) => ({
              value: level,
              label: level,
              icon: <PriorityGlyph priority={level} size={12} label={false} />,
              count: activeTickets.filter((ticket) => ticket.priority === level).length,
            })),
          ]}
          onChange={(value) => (value === "all" ? setFilters(INITIAL_FILTERS) : toggleFilter("priority", value))}
        />
      </Box>

      {/* KAI-24 — multi-select action bar (behind VITE_FF_ENABLE_TICKET_GROUPING) */}
      {TICKET_GROUPING_ENABLED && selectedTicketIds.size >= 2 && (
        <Box paddingVertical={6} paddingHorizontal={14}>
          <Callout
            tone="ai"
            actionLabel={grouping ? t("ticketList.grouping", "Agrupando...") : t("ticketList.groupSelected")}
            onAction={grouping ? undefined : handleGroupSelected}
            dismissLabel={t("ticketList.cancelSelection")}
            onDismiss={grouping ? undefined : clearTicketSelection}
          >
            {t("ticketList.selectedCount", { count: selectedTicketIds.size })}
          </Callout>
        </Box>
      )}

      {/* KAI-108 — grouping success banner (manual selection or AI-suggested accept) */}
      {groupSuccessCount !== null && (
        <Box paddingVertical={6} paddingHorizontal={14}>
          <Callout icon={<Icon name="check" size={13} color="var(--kairo-color-ok)" />}>
          {t("ticketList.groupSuccess", { count: groupSuccessCount })}
          </Callout>
        </Box>
      )}

      {/* KAI-24 — grouping error banner (manual selection or AI-suggested) */}
      {groupError && (
        <Box paddingVertical={6} paddingHorizontal={14}>
          <Callout tone="error">{groupError}</Callout>
        </Box>
      )}

      {/* KAI-24 — AI similarity suggestion callout (behind VITE_FF_ENABLE_TICKET_GROUPING) */}
      {TICKET_GROUPING_ENABLED && similarTickets && similarTickets.length > 0 && (
        <Box paddingVertical={6} paddingHorizontal={14}>
          <Callout
            tone="ai"
            actionLabel={groupingSimilar ? t("ticketList.grouping", "Agrupando...") : t("ticketList.similarAccept")}
            onAction={groupingSimilar ? undefined : handleAcceptSimilar}
            dismissLabel={t("ticketList.similarDismiss")}
            onDismiss={groupingSimilar ? undefined : handleDismissSimilar}
          >
            {t("ticketList.similarSuggestion", { count: similarTickets.length })}
          </Callout>
        </Box>
      )}

      {/* Sync result / error banner */}
      {syncResult && (
        <Box paddingVertical={6} paddingHorizontal={14}>
          <Callout icon={<Icon name="check" size={13} color="var(--kairo-color-ok)" />}>
          {t("ticketList.syncSuccess", "{{created}} nuevos · {{skipped}} omitidos", {
            created: syncResult.created,
            skipped: syncResult.skipped,
          })}
          </Callout>
        </Box>
      )}
      {syncError && (
        <Box paddingVertical={6} paddingHorizontal={14}>
          <Callout tone="error">{syncError}</Callout>
        </Box>
      )}

      {/* Scanning banner */}
      {isScanning && tickets.length > 0 && (
        <Box paddingVertical={6} paddingHorizontal={14}>
          <Callout tone="ai" icon={<PulseDot />}>
            {t("ticketList.scanning", { count: classifiedCount })}
          </Callout>
        </Box>
      )}

      {/* Skeleton while scanning with no tickets */}
      {isScanning && tickets.length === 0 ? (
        <Box flexGrow={1} flexShrink={1} flexBasis="0%" minHeight={0} scroll paddingBottom={8}>
          {Array.from({ length: 6 }).map((_, i) => (
            <TicketSkeleton key={i} />
          ))}
        </Box>
      ) : filtered.length === 0 ? (
        <EmptyState
          flex={1}
          title={tickets.length === 0 ? t("ticketList.noTickets") : t("ticketList.noMatch")}
          description={tickets.length === 0 ? t("ticketList.checkingEmails") : undefined}
          scanning={tickets.length === 0}
        />
      ) : filtered.length > VIRTUALIZE_THRESHOLD ? (
        <VirtualTicketList
          tickets={filtered}
          selectedTicketId={selectedTicketId}
          correctedTicketIds={correctedTicketIds}
          groupCounts={groupCounts}
          onSelect={selectTicket}
          selectedTicketIds={selectedTicketIds}
          onToggleSelect={TICKET_GROUPING_ENABLED ? toggleTicketSelection : undefined}
          hasRelatedHistory={!relatedHistoryLoading && relatedHistory.length > 0}
          onOpenHistory={handleOpenHistory}
        />
      ) : (
        <Box flexGrow={1} flexShrink={1} flexBasis="0%" minHeight={0} scroll paddingBottom={8}>
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
              onToggleSelect={TICKET_GROUPING_ENABLED ? toggleTicketSelection : undefined}
              hasRelatedHistory={selectedTicketId === ticket.id && !relatedHistoryLoading && relatedHistory.length > 0}
              onOpenHistory={handleOpenHistory}
            />
          ))}
        </Box>
      )}

      <RelatedHistoryDrawer
        open={historyDrawerOpen}
        loading={relatedHistoryLoading}
        items={relatedHistory}
        lang={i18n.language}
        onClose={() => setHistoryDrawerOpen(false)}
        onSelectTicket={handleSelectHistoricalTicket}
      />
    </Box>
  );
}
