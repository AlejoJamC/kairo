import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ClientFormModal } from "@/components/client-form-modal";
import { listClients, deleteClient } from "@kairo/client-core/endpoints";
import { useAuth } from "@kairo/client-core/auth";
import { useDraftContacts } from "@kairo/client-core/hooks/use-draft-contacts";
import { mapClientToRow, type ContactRow } from "@kairo/client-core/contact-row";
import { confirmDraft, bulkConfirmByOrganization } from "@kairo/client-core/draft-actions";
import type { Client } from "@/types";
import { Box, Button, Icon, PlainInput, PlainSelect, Pressable, Skeleton, Spinner, Text } from "@kairo/ui";
import { ContactCard, KpiStrip, mapRow } from "@/components/clients/contact-parts";
import { ContactDetailDrawer } from "@/components/clients/contact-detail-drawer";

type StatusFilter = "all" | "drafts" | "confirmed" | "rejected";
type PlanFilter   = "all" | "Enterprise" | "Pro" | "Starter" | "churn-risk";

// ---------------------------------------------------------------------------
// ClientDirectory
// ---------------------------------------------------------------------------

export function ClientDirectory() {
  const { t } = useTranslation("clients");
  const { accountId } = useAuth();

  // Clients (BFF)
  const [clients, setClients]       = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);

  // Drafts (Supabase direct, polling)
  const { drafts, error: draftsError, loading: draftsLoading, retry: retryDrafts } = useDraftContacts(accountId);

  // UI state
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("drafts");
  const [planFilter, setPlanFilter]     = useState<PlanFilter>("all");
  const [orgFilter, setOrgFilter]       = useState<string>("all");
  const [search, setSearch]             = useState("");
  const [formOpen, setFormOpen]         = useState(false);
  const [editingClient, setEditing]     = useState<Client | null>(null);
  const [deleting, setDeleting]         = useState<string | null>(null);
  const [selectedRow, setSelectedRow]   = useState<ContactRow | null>(null);
  // Optimistic removed draft ids (removed on quick confirm/reject, restored on polling error)
  const [optimisticRemovedIds, setOptimisticRemovedIds] = useState<Set<string>>(() => new Set());
  // Bulk confirm modal state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkConfirming, setBulkConfirming] = useState(false);
  const [bulkToast, setBulkToast]         = useState<string | null>(null);

  // Animate only rows whose id is new in the current poll.
  // The "seen" set is internal bookkeeping (no re-render needed) — keep it in a
  // ref. Only `newIds` (which controls render) lives in state. This avoids the
  // cascading-state warning while keeping the behavior correct.
  const seenIdsRef    = useRef<Set<string>>(new Set());
  const seenInitedRef = useRef(false);
  const [newIds, setNewIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (draftsLoading) return;
    const currentIds = new Set(drafts.map((d) => d.id));

    if (!seenInitedRef.current) {
      // First successful load: prime the seen set, do NOT animate existing rows.
      seenIdsRef.current   = currentIds;
      seenInitedRef.current = true;
      return;
    }

    const fresh = new Set<string>();
    for (const id of currentIds) {
      if (!seenIdsRef.current.has(id)) fresh.add(id);
    }

    if (fresh.size === 0) return;

    seenIdsRef.current = currentIds;
    // Intentional sync setState in effect: this is a "diff vs last poll" signal.
    // The cascading-render warning does not apply — there is no derived chain.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNewIds(fresh);
    const handle = setTimeout(() => setNewIds(new Set()), 600);
    return () => clearTimeout(handle);
  }, [drafts, draftsLoading]);

  // -------------------------------------------------------------------------
  // Fetch clients on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const res  = await listClients();
        const data = await res.json();
        setClients((data.clients as Record<string, unknown>[]).map(mapRow));
      } catch {
        // leave empty on error — clients are secondary for this view
      } finally {
        setClientsLoading(false);
      }
    };
    fetchClients();
  }, []);

  // -------------------------------------------------------------------------
  // Unified rows (clients + drafts)
  // TODO KAI-230: dedupe by email/phone between draft rows and client rows
  // -------------------------------------------------------------------------
  const allRows: ContactRow[] = useMemo(() => {
    const clientRows = clients.map(mapClientToRow);
    // Order: proposed → confirmed → rejected
    const statusOrder: Record<string, number> = { proposed: 0, confirmed: 1, rejected: 2 };
    return [...drafts, ...clientRows].sort((a, b) => {
      const sA = statusOrder[a.status] ?? 0;
      const sB = statusOrder[b.status] ?? 0;
      if (sA !== sB) return sA - sB;
      // Within same status bucket: ticketCount DESC, then lastSeenAt DESC
      if (b.ticketCount !== a.ticketCount) return b.ticketCount - a.ticketCount;
      const tA = a.lastSeenAt ? new Date(a.lastSeenAt).getTime() : 0;
      const tB = b.lastSeenAt ? new Date(b.lastSeenAt).getTime() : 0;
      return tB - tA;
    });
  }, [drafts, clients]);

  // Org list for filter dropdown (drafts only, >= 2 distinct orgs to show)
  const orgList = useMemo(() => {
    const orgs = new Set<string>();
    for (const row of allRows) {
      if (row.organization) orgs.add(row.organization);
    }
    return Array.from(orgs).sort();
  }, [allRows]);

  // Proposed draft count for selected org (used in bulk confirm modal)
  const proposedCountForOrg = useMemo(() => {
    if (orgFilter === "all") return 0;
    return allRows.filter(
      (r) => r.source === "draft" && r.status === "proposed" && r.organization === orgFilter
    ).length;
  }, [allRows, orgFilter]);

  // -------------------------------------------------------------------------
  // Filter pipeline: status → org → plan → search → optimistic removes
  // -------------------------------------------------------------------------
  const filteredRows = useMemo(() => {
    let rows = allRows;

    // 1. Status filter
    if (statusFilter === "drafts") {
      rows = rows.filter((r) => r.source === "draft" && r.status === "proposed");
    } else if (statusFilter === "confirmed") {
      rows = rows.filter((r) => r.source === "client" || (r.source === "draft" && r.status === "confirmed"));
    } else if (statusFilter === "rejected") {
      rows = rows.filter((r) => r.source === "draft" && r.status === "rejected");
    }
    // "all" → no filter

    // 2. Org filter (applies when an org is selected)
    if (orgFilter !== "all") {
      rows = rows.filter((r) => r.organization === orgFilter);
    }

    // 3. Plan filter (only applicable when viewing confirmed/all clients)
    const planFiltersActive = statusFilter === "all" || statusFilter === "confirmed";
    if (planFiltersActive && planFilter !== "all") {
      if (planFilter === "churn-risk") {
        rows = rows.filter((r) => r.slaLevel === "Critical");
      } else {
        rows = rows.filter((r) => r.plan === planFilter);
      }
    }

    // 4. Search (client-side, applies to the already status-filtered set)
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.displayName.toLowerCase().includes(q) ||
          (r.email?.toLowerCase().includes(q) ?? false) ||
          (r.phone?.toLowerCase().includes(q) ?? false) ||
          (r.organization?.toLowerCase().includes(q) ?? false),
      );
    }

    // 5. Optimistic removes (confirmed/rejected rows removed from current view until next poll)
    if (optimisticRemovedIds.size > 0) {
      rows = rows.filter((r) => !optimisticRemovedIds.has(r.id));
    }

    return rows;
  }, [allRows, statusFilter, orgFilter, planFilter, search, optimisticRemovedIds]);

  // -------------------------------------------------------------------------
  // Draft quick action handlers
  // -------------------------------------------------------------------------
  const handleQuickConfirm = async (row: ContactRow) => {
    const draftRawId = row.id.replace("draft:", "");
    setOptimisticRemovedIds((prev) => new Set([...prev, row.id]));
    try {
      await confirmDraft(draftRawId, row.lastSeenAt);
    } catch {
      // Restore on failure
      setOptimisticRemovedIds((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  const handleBulkConfirm = async () => {
    if (orgFilter === "all") return;
    setBulkConfirming(true);
    try {
      const count = await bulkConfirmByOrganization(orgFilter);
      setBulkModalOpen(false);
      setBulkToast(t("actions.bulkConfirmSuccess", { count }));
      setTimeout(() => setBulkToast(null), 4000);
    } catch {
      setBulkToast(t("errors.genericAction"));
      setTimeout(() => setBulkToast(null), 4000);
    } finally {
      setBulkConfirming(false);
    }
  };

  // -------------------------------------------------------------------------
  // Client CRUD handlers (unchanged)
  // -------------------------------------------------------------------------
  const handleSaved = (saved: Client) => {
    setClients((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
  };

  const handleDelete = async (clientId: string, name: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm(t("actions.confirmDelete", { name }))) return;
    setDeleting(clientId);
    try {
      await deleteClient(clientId);
      setClients((prev) => prev.filter((c) => c.id !== clientId));
    } catch { /* ignore */ }
    finally { setDeleting(null); }
  };

  // -------------------------------------------------------------------------
  // Loading state (first load only)
  // -------------------------------------------------------------------------
  const isFirstLoad = clientsLoading && draftsLoading;
  if (isFirstLoad) {
    return (
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" flexDirection="column" overflow="hidden" backgroundColor="white">
        <Box paddingTop={24} paddingHorizontal={32} paddingBottom={0} flexShrink={0}>
          <Box display="flex" alignItems="baseline" gap={12}>
            <Text tag="h1" fontSize={28} fontWeight={600} letterSpacing={-0.56} margin={0} font="display" color="var(--k-text-primary)" display="block">
              Clientes
            </Text>
          </Box>
        </Box>
        {/* Skeleton */}
        <Box flexGrow={1} flexShrink={1} flexBasis="0%" paddingVertical={24} paddingHorizontal={32}>
          {[1, 2, 3].map((i) => (
            <Skeleton
              key={i}
              height={56}
              marginBottom={1}
              borderTopLeftRadius={i === 1 ? 12 : 0}
              borderTopRightRadius={i === 1 ? 12 : 0}
              borderBottomLeftRadius={i === 3 ? 12 : 0}
              borderBottomRightRadius={i === 3 ? 12 : 0}
            />
          ))}
        </Box>
      </Box>
    );
  }

  // -------------------------------------------------------------------------
  // Status filter definitions
  // -------------------------------------------------------------------------
  const STATUS_FILTERS: { key: StatusFilter; labelKey: "filters.statusAll" | "filters.statusDrafts" | "filters.statusConfirmed" | "filters.statusRejected" }[] = [
    { key: "all",       labelKey: "filters.statusAll" },
    { key: "drafts",    labelKey: "filters.statusDrafts" },
    { key: "confirmed", labelKey: "filters.statusConfirmed" },
    { key: "rejected",  labelKey: "filters.statusRejected" },
  ];

  const PLAN_FILTERS: { key: PlanFilter; label: string }[] = [
    { key: "Enterprise", label: "Enterprise" },
    { key: "Pro",        label: "Pro" },
    { key: "Starter",    label: "Starter" },
    { key: "churn-risk", label: "Riesgo de churn" },
  ];

  const showPlanFilters = statusFilter === "all" || statusFilter === "confirmed";

  const TABLE_HEADERS = ["CLIENTE", "PLAN", "MRR", "TICKETS", "CSAT", "ÚLTIMO CONTACTO", ""];

  // -------------------------------------------------------------------------
  // Empty state message
  // -------------------------------------------------------------------------
  function emptyMessage() {
    if (search.trim()) return t("empty.noResults");
    if (statusFilter === "drafts") return t("empty.noDrafts");
    if (statusFilter === "confirmed") return t("empty.noConfirmed");
    if (statusFilter === "rejected") return t("empty.noRejected");
    return t("empty.noClients");
  }

  return (
    <Box flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" flexDirection="column" overflow="hidden" backgroundColor="white">
      {/* Header */}
      <Box paddingTop={24} paddingHorizontal={32} paddingBottom={0} flexShrink={0}>
        <Box display="flex" alignItems="baseline" gap={12}>
          <Text tag="h1" fontSize={28} fontWeight={600} letterSpacing={-0.56} margin={0} font="display" color="var(--k-text-primary)" display="block">
            Clientes
          </Text>
          <Text font="mono" fontSize={13} color="var(--k-text-tertiary)">
            {allRows.length}
          </Text>
        </Box>

        {/* KPI strip — always computed over clients */}
        <KpiStrip clients={clients} />

        {/* Draft polling error banner */}
        {draftsError && (
          <Text tag="div" marginTop={12} paddingVertical={10} paddingHorizontal={14} borderRadius={8} fontSize={13} backgroundColor="var(--kairo-color-bad-soft)" color="var(--kairo-color-bad-ink)" borderWidth={1} borderColor="var(--kairo-color-bad-line)" display="flex" alignItems="center" gap={8} borderStyle="solid">
            <Icon name="alert" size={14} />
            <Text flexGrow={1} flexShrink={1} flexBasis="0%">{t("errorMessage")}</Text>
            <Pressable onClick={retryDrafts} display="flex" alignItems="center" gap={4} fontSize={12} backgroundColor="transparent" borderWidth={0} cursor="pointer" color="var(--kairo-color-bad-ink)" fontWeight={500}>
              <Icon name="refresh" size={12} />
              {t("retry")}
            </Pressable>
          </Text>
        )}

        {/* Status pills */}
        <Box display="flex" gap={6} marginTop={20} flexWrap="wrap" alignItems="center">
          {STATUS_FILTERS.map(({ key, labelKey }) => (
            <Pressable key={key} onClick={() => setStatusFilter(key)} paddingVertical={5} paddingHorizontal={12} borderRadius={999} fontSize={13} cursor="pointer" backgroundColor={statusFilter === key ? "var(--k-text-primary)" : "white"} color={statusFilter === key ? "white" : "var(--k-text-secondary)"} borderWidth={1} borderColor={statusFilter === key ? "var(--k-text-primary)" : "var(--k-border)"} borderStyle="solid">
              {t(labelKey)}
            </Pressable>
          ))}
        </Box>

        {/* Org filter + bulk confirm button (shown when orgList has 2+ orgs) */}
        {orgList.length >= 2 && (
          <Box display="flex" gap={8} marginTop={12} alignItems="center" flexWrap="wrap">
            <PlainSelect value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)} paddingVertical={5} paddingHorizontal={10} borderRadius={6} fontSize={13} borderWidth={1} borderColor="var(--k-border)" backgroundColor="white" color="var(--k-text-secondary)" cursor="pointer" borderStyle="solid">
              <option value="all">Todas las organizaciones</option>
              {orgList.map((org) => (
                <option key={org} value={org}>{org}</option>
              ))}
            </PlainSelect>
            {orgFilter !== "all" && statusFilter === "drafts" && proposedCountForOrg > 0 && (
              <Pressable onClick={() => setBulkModalOpen(true)} paddingVertical={5} paddingHorizontal={12} borderRadius={6} fontSize={13} cursor="pointer" backgroundColor="var(--kairo-color-ok)" color="white" borderWidth={0} fontWeight={500}>
                {t("actions.bulkConfirmButton", { org: orgFilter })}
              </Pressable>
            )}
          </Box>
        )}

        {/* Plan pills + search + actions */}
        <Box display="flex" gap={6} marginTop={10} alignItems="center" flexWrap="wrap">
          {/* Plan pills — only when viewing confirmed/all */}
          {showPlanFilters && PLAN_FILTERS.map(({ key, label }) => (
            <Pressable key={key} onClick={() => setPlanFilter(planFilter === key ? "all" : key)} paddingVertical={5} paddingHorizontal={12} borderRadius={999} fontSize={13} cursor="pointer" backgroundColor={planFilter === key ? "var(--kairo-color-accent)" : "white"} color={planFilter === key ? "white" : "var(--k-text-secondary)"} borderWidth={1} borderColor={planFilter === key ? "var(--kairo-color-accent)" : "var(--k-border)"} borderStyle="solid">
              {label}
            </Pressable>
          ))}

          {/* Search */}
          <Box display="flex" alignItems="center" gap={6} paddingVertical={5} paddingHorizontal={12} borderRadius={6} borderWidth={1} borderColor="var(--k-border)" backgroundColor="white" marginLeft={showPlanFilters ? "auto" : undefined} borderStyle="solid">
            <Icon name="search" size={13} color="var(--k-text-tertiary)" />
            <PlainInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search.placeholder")} borderWidth={0} outlineWidth={0} fontSize={13} color="var(--k-text-primary)" backgroundColor="transparent" width={200} />
            {search && (
              <Pressable onClick={() => setSearch("")} backgroundColor="transparent" borderWidth={0} cursor="pointer" color="var(--k-text-tertiary)" padding={0}>
                <Icon name="x" size={12} />
              </Pressable>
            )}
          </Box>

          {/* Export + Add client */}
          <Box display="flex" gap={8} marginLeft={showPlanFilters ? undefined : "auto"}>
            <Pressable display="flex" alignItems="center" gap={6} paddingVertical={7} paddingHorizontal={12} fontSize={13} borderRadius={6} borderWidth={1} borderColor="var(--k-border)" backgroundColor="white" color="var(--k-text-secondary)" cursor="pointer" borderStyle="solid">
              <Icon name="download" size={13} />
              Exportar
            </Pressable>
            <Button variant="primary" icon={<Icon name="plus" size={13} color="white" />} onPress={() => { setEditing(null); setFormOpen(true); }}>
              Agregar cliente
            </Button>
          </Box>
        </Box>
      </Box>

      {/* Table */}
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" scroll paddingTop={16} paddingHorizontal={32} paddingBottom={32}>
        {filteredRows.length === 0 ? (
          <Text tag="div" display="flex" alignItems="center" justifyContent="center" height={160} fontSize={13} color="var(--k-text-tertiary)" textAlign="center" paddingVertical={0} paddingHorizontal={40}>
            {emptyMessage()}
          </Text>
        ) : (
          <Box borderWidth={1} borderColor="var(--k-border)" borderRadius={12} overflow="hidden" backgroundColor="white" boxShadow="0 1px 2px rgba(9,9,11,0.04)" borderStyle="solid">
            {/* Table header */}
            <Text tag="div" grid gridTemplateColumns="2.5fr 1fr 0.8fr 0.8fr 1fr 0.8fr 36px" paddingVertical={10} paddingHorizontal={16} borderBottomWidth={1} borderBottomColor="var(--k-border)" backgroundColor="var(--k-surface)" font="mono" fontSize={11} color="var(--k-text-tertiary)" textTransform="uppercase" letterSpacing={0.55} borderStyle="solid">
              {TABLE_HEADERS.map((h, i) => <span key={i}>{h}</span>)}
            </Text>

            {/* Rows */}
            {filteredRows.map((row, idx) => {
              // Resolve back to Client for edit/delete (only for source=client)
              const clientId = row.source === "client" ? row.id.replace("client:", "") : null;
              const client = clientId ? clients.find((c) => c.id === clientId) ?? null : null;

              return (
                <ContactCard
                  key={row.id}
                  row={row}
                  isLast={idx === filteredRows.length - 1}
                  isNew={newIds.has(row.id)}
                  onSelect={setSelectedRow}
                  onEdit={client ? (e) => { e.stopPropagation(); setEditing(client); setFormOpen(true); } : undefined}
                  onDelete={client ? (e) => handleDelete(client.id, client.name, e) : undefined}
                  onQuickConfirm={row.source === "draft" && row.status === "proposed" ? () => handleQuickConfirm(row) : undefined}
                  deleting={clientId ? deleting === clientId : false}
                />
              );
            })}
          </Box>
        )}
      </Box>

      {selectedRow && (
        <ContactDetailDrawer
          row={selectedRow}
          client={selectedRow.source === "client" ? clients.find((c) => c.id === selectedRow.id.replace("client:", "")) ?? null : null}
          onClose={() => setSelectedRow(null)}
          onOptimisticRemove={(id) => {
            setOptimisticRemovedIds((prev) => new Set([...prev, id]));
            setSelectedRow(null);
          }}
          onOptimisticRestore={(id) => {
            setOptimisticRemovedIds((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }}
        />
      )}

      {/* Bulk confirm modal */}
      {bulkModalOpen && orgFilter !== "all" && (
        <>
          <Box onClick={() => !bulkConfirming && setBulkModalOpen(false)} fixed top={0} right={0} bottom={0} left={0} zIndex={50} backgroundColor="rgba(0,0,0,0.3)" />
          <Box fixed top="50%" left="50%" transform="translate(-50%,-50%)" zIndex={60} backgroundColor="white" borderRadius={12} padding={24} width={400} boxShadow="0 8px 32px rgba(9,9,11,0.16)">
            <Text tag="h3" marginTop={0} marginHorizontal={0} marginBottom={12} fontSize={16} fontWeight={600} color="var(--k-text-primary)" display="block">
              {t("actions.bulkConfirmModalTitle", { org: orgFilter })}
            </Text>
            <Text tag="p" marginTop={0} marginHorizontal={0} marginBottom={20} fontSize={13} color="var(--k-text-secondary)" lineHeight={19.5} display="block">
              {t("actions.bulkConfirmModalBody", { count: proposedCountForOrg })}
            </Text>
            <Box display="flex" gap={8} justifyContent="flex-end">
              <Pressable onClick={() => setBulkModalOpen(false)} disabled={bulkConfirming} paddingVertical={7} paddingHorizontal={14} borderRadius={6} fontSize={13} cursor="pointer" backgroundColor="white" borderWidth={1} borderColor="var(--k-border)" color="var(--k-text-secondary)" borderStyle="solid">
                {t("actions.cancel")}
              </Pressable>
              <Pressable onClick={handleBulkConfirm} disabled={bulkConfirming} paddingVertical={7} paddingHorizontal={14} borderRadius={6} fontSize={13} cursor="pointer" backgroundColor="var(--kairo-color-ok)" color="white" borderWidth={0} fontWeight={500} display="flex" alignItems="center" gap={6}>
                {bulkConfirming && <Spinner />}
                {t("actions.confirm")}
              </Pressable>
            </Box>
          </Box>
        </>
      )}

      {/* Toast notification */}
      {bulkToast && (
        <Text tag="div" fixed bottom={24} right={24} zIndex={70} backgroundColor="#1E293B" color="white" paddingVertical={12} paddingHorizontal={16} borderRadius={8} fontSize={13} boxShadow="0 4px 12px rgba(0,0,0,0.2)" display="block">
          {bulkToast}
        </Text>
      )}

      <ClientFormModal
        isOpen={formOpen}
        client={editingClient}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />
    </Box>
  );
}
