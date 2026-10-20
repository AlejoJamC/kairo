import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ClientFormModal } from "@/components/client-form-modal";
import { listClients, deleteClient } from "@kairo/client-core/endpoints";
import { useAuth } from "@kairo/client-core/auth";
import { useDraftContacts } from "@kairo/client-core/hooks/use-draft-contacts";
import { mapClientToRow, type ContactRow } from "@kairo/client-core/contact-row";
import { confirmDraft, bulkConfirmByOrganization } from "@kairo/client-core/draft-actions";
import type { Client } from "@/types";
import { Box, Button, Callout, DataTable, Dialog, FilterPill, FilterPillDivider, FilterPillGroup, FilterPillSelect, Icon, KpiStrip, PageFrame, PageHeader, PageSearch, PageToolbar, Skeleton, Text, Toast } from "@kairo/ui";
import { useContactColumns } from "@/components/clients/contact-columns";
import { clientKpis, mapRow } from "@/components/clients/contact-helpers";
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

  const columns = useContactColumns({
    deletingId: deleting,
    onEdit: (row) => {
      const client = clients.find((c) => c.id === row.id.replace("client:", "")) ?? null;
      if (client) { setEditing(client); setFormOpen(true); }
    },
    onDelete: (row) => {
      const client = clients.find((c) => c.id === row.id.replace("client:", ""));
      if (client) void handleDelete(client.id, client.name);
    },
    onQuickConfirm: (row) => void handleQuickConfirm(row),
  });

  // -------------------------------------------------------------------------
  // Loading state (first load only)
  // -------------------------------------------------------------------------
  const isFirstLoad = clientsLoading && draftsLoading;
  if (isFirstLoad) {
    return (
      <PageFrame>
        <PageHeader title={t("title")} count={null} />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} height={56} borderRadius={i === 2 ? 0 : 12} />
        ))}
      </PageFrame>
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
    <PageFrame>
      <PageHeader
        title={t("title")}
        count={clientsLoading ? null : allRows.length}
        countLabel={t("countLabel", { count: allRows.length })}
      />

      <KpiStrip items={clientKpis(clients)} loading={clientsLoading} />

      {/* Draft polling error banner */}
      {draftsError && (
        <Callout tone="error" icon={<Icon name="alert" size={14} />} actionLabel={t("retry")} onAction={retryDrafts}>
          {t("errorMessage")}
        </Callout>
      )}

      <PageToolbar>
        <FilterPillGroup label={t("filters.status")}>
          {STATUS_FILTERS.map(({ key, labelKey }) => (
            <FilterPill key={key} kind="tab" active={statusFilter === key} onPress={() => setStatusFilter(key)}>
              {t(labelKey)}
            </FilterPill>
          ))}
        </FilterPillGroup>
        {(orgList.length >= 2 || showPlanFilters) && <FilterPillDivider />}
        {orgList.length >= 2 && (
          <FilterPillSelect
            label={t("filters.organization")}
            value={orgFilter}
            onValueChange={setOrgFilter}
            options={[{ value: "all", label: t("filters.allOrganizations") }, ...orgList.map((org) => ({ value: org, label: org }))]}
          />
        )}
        {showPlanFilters && (
          <FilterPillGroup label={t("filters.plan")} semantics="group">
            {PLAN_FILTERS.map(({ key, label }) => (
              <FilterPill key={key} active={planFilter === key} onPress={() => setPlanFilter(planFilter === key ? "all" : key)}>
                {label}
              </FilterPill>
            ))}
          </FilterPillGroup>
        )}
        {orgFilter !== "all" && statusFilter === "drafts" && proposedCountForOrg > 0 && (
          <Button variant="primary" size="lg" onPress={() => setBulkModalOpen(true)}>
            {t("actions.bulkConfirmButton", { org: orgFilter })}
          </Button>
        )}
      </PageToolbar>

      <PageToolbar>
        <PageSearch label={t("search.label")} placeholder={t("search.placeholder")} value={search} onChange={setSearch} />
        <Box flexGrow={1} />
        <Button size="lg" icon={<Icon name="download" size={13} />}>{t("actions.export")}</Button>
        <Button variant="primary" size="lg" icon={<Icon name="plus" size={13} color="var(--kairo-color-on-accent)" />} onPress={() => { setEditing(null); setFormOpen(true); }}>
          {t("addClient")}
        </Button>
      </PageToolbar>

      <DataTable
        label={t("title")}
        columns={columns}
        rows={filteredRows}
        rowKey={(row) => row.id}
        onRowClick={setSelectedRow}
        isNewRow={(row) => newIds.has(row.id)}
        emptyLabel={emptyMessage()}
      />

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
      <Dialog
        open={bulkModalOpen && orgFilter !== "all"}
        onOpenChange={(open) => { if (!bulkConfirming) setBulkModalOpen(open); }}
        title={t("actions.bulkConfirmModalTitle", { org: orgFilter })}
        maxWidth={400}
        footer={<>
          <Button disabled={bulkConfirming} onPress={() => setBulkModalOpen(false)}>{t("actions.cancel")}</Button>
          <Button variant="primary" loading={bulkConfirming} onPress={handleBulkConfirm}>{t("actions.confirm")}</Button>
        </>}
      >
        <Text tag="p" display="block" margin={0} fontSize={13} color="var(--k-text-secondary)" lineHeight={19.5}>
          {t("actions.bulkConfirmModalBody", { count: proposedCountForOrg })}
        </Text>
      </Dialog>

      {bulkToast && <Toast closeLabel={t("actions.cancel")} onClose={() => setBulkToast(null)}>{bulkToast}</Toast>}

      <ClientFormModal
        isOpen={formOpen}
        client={editingClient}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />
    </PageFrame>
  );
}
