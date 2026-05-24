import { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Download,
  Plus,
  MoreHorizontal,
  Loader2,
  X,
  Edit2,
  Trash2,
  SmilePlus,
  Meh,
  Frown,
  Search,
  AlertCircle,
  RefreshCw,
  Check,
  XCircle,
  RotateCcw,
  Pencil,
} from "lucide-react";
import { ClientFormModal } from "@/components/client-form-modal";
import { apiCall } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { useDraftContacts } from "@/hooks/use-draft-contacts";
import { mapClientToRow, type ContactRow, type ContactRowStatus } from "@/types/contact-row";
import {
  confirmDraft,
  rejectDraft,
  unrejectDraft,
  editDraft,
  bulkConfirmByOrganization,
  type EditPatch,
} from "@/lib/draft-actions";
import type { Client, PlanType, SlaLevel, ContactPerson } from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PLAN_DOT: Record<string, string> = {
  Enterprise: "#2B5BFF",
  Pro:        "#2B5BFF",
  Starter:    "#A1A1AA",
};

const PLAN_LABEL: Record<string, string> = {
  Enterprise: "Enterprise",
  Pro:        "Pro",
  Starter:    "Starter",
};

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#FCA5A5,#F472B6)",
  "linear-gradient(135deg,#93C5FD,#60A5FA)",
  "linear-gradient(135deg,#FDE68A,#F59E0B)",
  "linear-gradient(135deg,#86EFAC,#10B981)",
  "linear-gradient(135deg,#C4B5FD,#A855F7)",
  "linear-gradient(135deg,#FCD5CE,#F87171)",
  "linear-gradient(135deg,#FECDD3,#EC4899)",
  "linear-gradient(135deg,#FCA5A5,#EF4444)",
];

function avatarGradient(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

function mapRow(row: Record<string, unknown>): Client {
  return {
    id:              row.id as string,
    internalId:      row.internal_id as string,
    legalId:         (row.legal_id as string | null) ?? null,
    name:            row.name as string,
    telephone:       (row.telephone as string | null) ?? null,
    authorizedEmails: (row.authorized_emails as string[]) ?? [],
    contactPersons:  (row.contact_persons as ContactPerson[]) ?? [],
    plan:            (row.plan_type as PlanType | null) ?? null,
    slaLevel:        (row.sla_level as SlaLevel | null) ?? null,
    ticketCount:     (row.ticketCount as number) ?? 0,
    csatAvg:         (row.csatAvg as number | null) ?? null,
    lastContactAt:   (row.lastContactAt as string | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

type BadgeVariant = "proposed" | "confirmed" | "rejected" | "external";

const BADGE_STYLE: Record<BadgeVariant, { bg: string; color: string; border: string }> = {
  proposed:  { bg: "#EFF6FF", color: "#2563EB", border: "#BFDBFE" },
  confirmed: { bg: "#F0FDF4", color: "#16A34A", border: "#BBF7D0" },
  rejected:  { bg: "#F4F4F5", color: "#71717A", border: "#E4E4E7" },
  external:  { bg: "#FFF7ED", color: "#C2410C", border: "#FED7AA" },
};

function StatusBadge({ status }: { status: ContactRowStatus }) {
  const { t } = useTranslation("clients");
  const s = BADGE_STYLE[status];
  const labelKey =
    status === "proposed"  ? "badges.draft" :
    status === "confirmed" ? "badges.confirmed" :
                             "badges.rejected";
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      letterSpacing: "0.03em", flexShrink: 0,
    }}>
      {t(labelKey)}
    </span>
  );
}

function ExternalSourceBadge({ source }: { source: string }) {
  const s = BADGE_STYLE.external;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      letterSpacing: "0.03em", flexShrink: 0,
    }}>
      {source}
    </span>
  );
}

// ---------------------------------------------------------------------------
// KPI cards (unchanged — still computed over clients only)
// ---------------------------------------------------------------------------

function KpiStrip({ clients }: { clients: Client[] }) {
  const active    = clients.filter((c) => c.ticketCount > 0 || c.plan != null).length;
  const csatVals  = clients.map((c) => c.csatAvg).filter((v): v is number => v != null);
  const csatAvg   = csatVals.length ? (csatVals.reduce((a, b) => a + b, 0) / csatVals.length).toFixed(1) : "—";
  const churnRisk = clients.filter((c) => c.slaLevel === "Critical").length;

  const items = [
    { label: "MRR TOTAL",        value: "—",                          delta: null,         accent: undefined },
    { label: "ACTIVOS",          value: `${active} / ${clients.length}`, delta: null,      accent: undefined },
    { label: "CSAT PROMEDIO",    value: csatAvg,                      delta: null,         accent: undefined },
    { label: "RIESGO DE CHURN",  value: String(churnRisk),            delta: churnRisk > 0 ? `↑${churnRisk}` : null, accent: churnRisk > 0 ? "#EF4444" : undefined },
  ];

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(4,1fr)",
      gap: 1, background: "var(--k-border-subtle)",
      border: "1px solid var(--k-border)", borderRadius: 10,
      overflow: "hidden", marginTop: 20,
    }}>
      {items.map((s) => (
        <div key={s.label} style={{ background: "white", padding: 16 }}>
          <div style={{ fontSize: 11, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            {s.label}
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 24, fontWeight: 600, color: s.accent ?? "var(--k-text-primary)", fontFamily: "var(--k-font-display)" }}>
              {s.value}
            </span>
            {s.delta && (
              <span style={{ fontSize: 12, color: s.accent ?? "#10B981", fontFamily: "var(--k-font-mono)" }}>
                {s.delta}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSAT cell
// ---------------------------------------------------------------------------

function CsatCell({ value }: { value: number | null }) {
  if (value == null) return <span style={{ color: "var(--k-text-tertiary)", fontFamily: "var(--k-font-mono)" }}>—</span>;
  const color = value >= 4.7 ? "#10B981" : value >= 4.0 ? "#F59E0B" : "#EF4444";
  const Icon  = value >= 4.7 ? SmilePlus : value >= 4.0 ? Meh : Frown;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <Icon style={{ width: 14, height: 14, color }} />
      <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 13 }}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unified ContactRow card/row
// ---------------------------------------------------------------------------

function ContactCard({
  row,
  isLast,
  isNew = false,
  onSelect,
  onEdit,
  onDelete,
  onQuickConfirm,
  deleting,
}: {
  row: ContactRow;
  isLast: boolean;
  isNew?: boolean;
  onSelect: (row: ContactRow) => void;
  onEdit?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  onQuickConfirm?: (e: React.MouseEvent) => void;
  deleting?: boolean;
}) {
  const { t } = useTranslation("clients");
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const grad = avatarGradient(row.displayName);
  const ini  = initials(row.displayName);
  const isDraft = row.source === "draft";
  const isProposedDraft = isDraft && row.status === "proposed";

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setMenuOpen(false); }}
      onClick={() => onSelect(row)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(row); } }}
      style={{
        display: "grid",
        gridTemplateColumns: "2.5fr 1fr 0.8fr 0.8fr 1fr 0.8fr 36px",
        padding: "12px 16px",
        borderBottom: isLast ? "none" : "1px solid var(--k-border-subtle)",
        alignItems: "center",
        fontSize: 13,
        cursor: "pointer",
        background: hover ? "var(--k-surface)" : isNew ? "rgba(43,91,255,0.04)" : "transparent",
        transition: "background 0.1s",
        animation: isNew ? "kairo-row-in 0.5s ease-out" : undefined,
      }}
    >
      {/* CLIENTE / BORRADOR */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%", background: grad,
          color: "white", display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 600, fontSize: 11, flexShrink: 0,
        }}>
          {ini}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 500, color: "var(--k-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.displayName}
            </span>
            <StatusBadge status={row.status} />
            {row.externalSource && <ExternalSourceBadge source={row.externalSource} />}
          </div>
          <div style={{ fontSize: 11, color: "var(--k-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
            {row.organization
              ? `${row.organization} · ${row.email ?? row.phone ?? ""}`
              : (row.email ?? row.phone ?? "—")}
          </div>
        </div>
      </div>

      {/* PLAN — only for clients */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {!isDraft && row.plan ? (
          <>
            <span style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: PLAN_DOT[row.plan] ?? "#A1A1AA" }} />
            <span>{PLAN_LABEL[row.plan] ?? row.plan}</span>
          </>
        ) : (
          <span style={{ color: "var(--k-text-tertiary)" }}>—</span>
        )}
      </div>

      {/* MRR */}
      <span style={{ fontFamily: "var(--k-font-mono)", color: "var(--k-text-secondary)" }}>—</span>

      {/* TICKETS */}
      <span style={{ fontFamily: "var(--k-font-mono)" }}>{row.ticketCount}</span>

      {/* CSAT */}
      {!isDraft ? <CsatCell value={row.csatAvg} /> : <span style={{ color: "var(--k-text-tertiary)", fontFamily: "var(--k-font-mono)" }}>—</span>}

      {/* ÚLTIMO CONTACTO */}
      <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 12, color: "var(--k-text-tertiary)" }}>
        {relativeTime(row.lastSeenAt)}
      </span>

      {/* ACTIONS */}
      <div style={{ position: "relative" }}>
        {isProposedDraft && (
          <button
            onClick={(e) => { e.stopPropagation(); onQuickConfirm?.(e); }}
            title={t("actions.confirm")}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "3px 8px", borderRadius: 5,
              background: "#F0FDF4", border: "1px solid #BBF7D0",
              cursor: "pointer", color: "#16A34A", fontSize: 11, fontWeight: 600,
              opacity: hover ? 1 : 0, transition: "opacity 0.1s",
            }}
          >
            <Check style={{ width: 11, height: 11 }} />
            {t("actions.confirm")}
          </button>
        )}
        {!isDraft && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
              style={{
                padding: 4, borderRadius: 5, background: "none", border: "none",
                cursor: "pointer", color: "var(--k-text-tertiary)",
                opacity: hover ? 1 : 0, transition: "opacity 0.1s",
              }}
            >
              <MoreHorizontal style={{ width: 14, height: 14 }} />
            </button>
            {menuOpen && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 20,
                background: "white", border: "1px solid var(--k-border)",
                borderRadius: 8, boxShadow: "0 4px 12px rgba(9,9,11,0.1)",
                minWidth: 140, overflow: "hidden",
              }}>
                <button
                  onClick={(e) => { setMenuOpen(false); onEdit?.(e); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: "var(--k-text-primary)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--k-surface)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <Edit2 style={{ width: 13, height: 13, color: "var(--k-text-tertiary)" }} /> Editar
                </button>
                <button
                  onClick={(e) => { setMenuOpen(false); onDelete?.(e); }}
                  disabled={deleting}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: "#DC2626" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#FEF2F2")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  {deleting
                    ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
                    : <Trash2 style={{ width: 13, height: 13 }} />}
                  Eliminar
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter types
// ---------------------------------------------------------------------------

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
        const res  = await apiCall("/bff/clients");
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
      await apiCall(`/bff/clients/${clientId}`, { method: "DELETE" });
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
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "white" }}>
        <div style={{ padding: "24px 32px 0", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, fontFamily: "var(--k-font-display)", color: "var(--k-text-primary)" }}>
              Clientes
            </h1>
          </div>
        </div>
        {/* Skeleton */}
        <div style={{ flex: 1, padding: "24px 32px" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{
              height: 56, marginBottom: 1, borderRadius: i === 1 ? "12px 12px 0 0" : i === 3 ? "0 0 12px 12px" : 0,
              background: "var(--k-surface)", animation: "pulse 1.5s ease-in-out infinite",
            }} />
          ))}
        </div>
      </div>
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
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "white" }}>
      {/* Header */}
      <div style={{ padding: "24px 32px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, fontFamily: "var(--k-font-display)", color: "var(--k-text-primary)" }}>
            Clientes
          </h1>
          <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 13, color: "var(--k-text-tertiary)" }}>
            {allRows.length}
          </span>
        </div>

        {/* KPI strip — always computed over clients */}
        <KpiStrip clients={clients} />

        {/* Draft polling error banner */}
        {draftsError && (
          <div style={{
            marginTop: 12, padding: "10px 14px", borderRadius: 8, fontSize: 13,
            background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <AlertCircle style={{ width: 14, height: 14, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{t("errorMessage")}</span>
            <button
              onClick={retryDrafts}
              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontWeight: 500 }}
            >
              <RefreshCw style={{ width: 12, height: 12 }} />
              {t("retry")}
            </button>
          </div>
        )}

        {/* Status pills */}
        <div style={{ display: "flex", gap: 6, marginTop: 20, flexWrap: "wrap", alignItems: "center" }}>
          {STATUS_FILTERS.map(({ key, labelKey }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              style={{
                padding: "5px 12px", borderRadius: 999, fontSize: 13, cursor: "pointer",
                background: statusFilter === key ? "var(--k-text-primary)" : "white",
                color: statusFilter === key ? "white" : "var(--k-text-secondary)",
                border: `1px solid ${statusFilter === key ? "var(--k-text-primary)" : "var(--k-border)"}`,
              }}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>

        {/* Org filter + bulk confirm button (shown when orgList has 2+ orgs) */}
        {orgList.length >= 2 && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              style={{
                padding: "5px 10px", borderRadius: 6, fontSize: 13,
                border: "1px solid var(--k-border)", background: "white",
                color: "var(--k-text-secondary)", cursor: "pointer",
              }}
            >
              <option value="all">Todas las organizaciones</option>
              {orgList.map((org) => (
                <option key={org} value={org}>{org}</option>
              ))}
            </select>
            {orgFilter !== "all" && statusFilter === "drafts" && proposedCountForOrg > 0 && (
              <button
                onClick={() => setBulkModalOpen(true)}
                style={{
                  padding: "5px 12px", borderRadius: 6, fontSize: 13, cursor: "pointer",
                  background: "#16A34A", color: "white", border: "none", fontWeight: 500,
                }}
              >
                {t("actions.bulkConfirmButton", { org: orgFilter })}
              </button>
            )}
          </div>
        )}

        {/* Plan pills + search + actions */}
        <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* Plan pills — only when viewing confirmed/all */}
          {showPlanFilters && PLAN_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPlanFilter(planFilter === key ? "all" : key)}
              style={{
                padding: "5px 12px", borderRadius: 999, fontSize: 13, cursor: "pointer",
                background: planFilter === key ? "#2B5BFF" : "white",
                color: planFilter === key ? "white" : "var(--k-text-secondary)",
                border: `1px solid ${planFilter === key ? "#2B5BFF" : "var(--k-border)"}`,
              }}
            >
              {label}
            </button>
          ))}

          {/* Search */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 6,
            border: "1px solid var(--k-border)", background: "white",
            marginLeft: showPlanFilters ? "auto" : undefined,
          }}>
            <Search style={{ width: 13, height: 13, color: "var(--k-text-tertiary)" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search.placeholder")}
              style={{
                border: "none", outline: "none", fontSize: 13,
                color: "var(--k-text-primary)", background: "transparent",
                width: 200,
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--k-text-tertiary)", padding: 0 }}>
                <X style={{ width: 12, height: 12 }} />
              </button>
            )}
          </div>

          {/* Export + Add client */}
          <div style={{ display: "flex", gap: 8, marginLeft: showPlanFilters ? undefined : "auto" }}>
            <button
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "7px 12px", fontSize: 13, borderRadius: 6,
                border: "1px solid var(--k-border)", background: "white",
                color: "var(--k-text-secondary)", cursor: "pointer",
              }}
            >
              <Download style={{ width: 13, height: 13 }} />
              Exportar
            </button>
            <button
              onClick={() => { setEditing(null); setFormOpen(true); }}
              className="k-btn-primary"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", fontSize: 13 }}
            >
              <Plus style={{ width: 13, height: 13 }} />
              Agregar cliente
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 32px 32px" }}>
        {filteredRows.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, fontSize: 13, color: "var(--k-text-tertiary)", textAlign: "center", padding: "0 40px" }}>
            {emptyMessage()}
          </div>
        ) : (
          <div style={{
            border: "1px solid var(--k-border)", borderRadius: 12,
            overflow: "hidden", background: "white",
            boxShadow: "0 1px 2px rgba(9,9,11,0.04)",
          }}>
            {/* Table header */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "2.5fr 1fr 0.8fr 0.8fr 1fr 0.8fr 36px",
              padding: "10px 16px",
              borderBottom: "1px solid var(--k-border)",
              background: "var(--k-surface)",
              fontFamily: "var(--k-font-mono)",
              fontSize: 11,
              color: "var(--k-text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              {TABLE_HEADERS.map((h, i) => <span key={i}>{h}</span>)}
            </div>

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
          </div>
        )}
      </div>

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
          <div
            onClick={() => !bulkConfirming && setBulkModalOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.3)" }}
          />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            zIndex: 60, background: "white", borderRadius: 12, padding: 24, width: 400,
            boxShadow: "0 8px 32px rgba(9,9,11,0.16)",
          }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 600, color: "var(--k-text-primary)" }}>
              {t("actions.bulkConfirmModalTitle", { org: orgFilter })}
            </h3>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "var(--k-text-secondary)", lineHeight: 1.5 }}>
              {t("actions.bulkConfirmModalBody", { count: proposedCountForOrg })}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => setBulkModalOpen(false)}
                disabled={bulkConfirming}
                style={{
                  padding: "7px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
                  background: "white", border: "1px solid var(--k-border)", color: "var(--k-text-secondary)",
                }}
              >
                {t("actions.cancel")}
              </button>
              <button
                onClick={handleBulkConfirm}
                disabled={bulkConfirming}
                style={{
                  padding: "7px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
                  background: "#16A34A", color: "white", border: "none", fontWeight: 500,
                  display: "flex", alignItems: "center", gap: 6,
                }}
              >
                {bulkConfirming && <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />}
                {t("actions.confirm")}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Toast notification */}
      {bulkToast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 70,
          background: "#1E293B", color: "white", padding: "12px 16px",
          borderRadius: 8, fontSize: 13, boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
        }}>
          {bulkToast}
        </div>
      )}

      <ClientFormModal
        isOpen={formOpen}
        client={editingClient}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}



// ---------------------------------------------------------------------------
// ContactDetailDrawer — read-only slide-out for both source='client' and 'draft'.
// Editing/confirming/rejecting actions for drafts are KAI-228.
// CRM edit/delete for clients lives in the row menu, not in this drawer.
// ---------------------------------------------------------------------------

function ContactDetailDrawer({
  row,
  client,
  onClose,
  onOptimisticRemove,
  onOptimisticRestore,
}: {
  row: ContactRow;
  client: Client | null;
  onClose: () => void;
  onOptimisticRemove?: (id: string) => void;
  onOptimisticRestore?: (id: string) => void;
}) {
  const { t } = useTranslation("clients");
  const grad  = avatarGradient(row.displayName);
  const ini   = initials(row.displayName);
  const isDraft = row.source === "draft";
  const draftRawId = row.id.replace("draft:", "");

  // Edit mode state
  const [editMode, setEditMode]     = useState(false);
  const [editValues, setEditValues] = useState({
    display_name: row.displayName ?? "",
    email:        row.email ?? "",
    phone:        row.phone ?? "",
    organization: row.organization ?? "",
  });
  const [editError, setEditError]   = useState<string | null>(null);
  const [saving, setSaving]         = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const isProposed  = isDraft && row.status === "proposed";
  const isRejected  = isDraft && row.status === "rejected";
  const isConfirmed = isDraft && row.status === "confirmed";
  const isKairoCreated = (row as ContactRow & { origin?: string }).origin === "kairo_created" ||
    // fallback: external source absent → assume kairo_created for proposed drafts without external badge
    (!row.externalSource && isProposed);

  const handleConfirm = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      await confirmDraft(draftRawId, row.lastSeenAt);
      onOptimisticRemove?.(row.id);
    } catch {
      setActionError(t("errors.genericAction"));
      onOptimisticRestore?.(row.id);
    } finally {
      setActionBusy(false);
    }
  };

  const handleReject = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      await rejectDraft(draftRawId);
      onOptimisticRemove?.(row.id);
    } catch {
      setActionError(t("errors.genericAction"));
      onOptimisticRestore?.(row.id);
    } finally {
      setActionBusy(false);
    }
  };

  const handleUnreject = async () => {
    setActionBusy(true);
    setActionError(null);
    try {
      await unrejectDraft(draftRawId);
      onOptimisticRemove?.(row.id);
    } catch {
      setActionError(t("errors.genericAction"));
      onOptimisticRestore?.(row.id);
    } finally {
      setActionBusy(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setEditError(null);
    const patch: EditPatch = {
      display_name: editValues.display_name || null,
      email:        editValues.email || null,
      phone:        editValues.phone || null,
      organization: editValues.organization || null,
    };
    try {
      await editDraft(draftRawId, patch);
      setEditMode(false);
    } catch (err) {
      const error = err as Error & { code?: string };
      if (error.message === "invalid_email_format") {
        setEditError(t("errors.invalidEmail"));
      } else if (error.message === "invalid_phone_format") {
        setEditError(t("errors.invalidPhone"));
      } else if (error.code === "merge_candidate") {
        setEditError(t("errors.mergeCandidate"));
      } else {
        setEditError(t("errors.genericSave"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 30, background: "rgba(0,0,0,0.2)" }}
      />
      <div
        role="dialog"
        aria-label={row.displayName}
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 40,
          width: 400, background: "white", boxShadow: "-4px 0 16px rgba(9,9,11,0.08)",
          overflowY: "auto", display: "flex", flexDirection: "column",
        }}
      >
        <div style={{
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
          padding: "20px 24px 16px", borderBottom: "1px solid var(--k-border)", flexShrink: 0,
        }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
            <div style={{
              width: 40, height: 40, borderRadius: "50%", background: grad,
              color: "white", display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 600, fontSize: 13, flexShrink: 0,
            }}>
              {ini}
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{
                fontSize: 16, fontWeight: 600, color: "var(--k-text-primary)",
                fontFamily: "var(--k-font-display)", margin: 0,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {row.displayName}
              </h2>
              <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center", flexWrap: "wrap" }}>
                <StatusBadge status={row.status} />
                {row.externalSource && <ExternalSourceBadge source={row.externalSource} />}
                {client && (
                  <span style={{ fontSize: 11, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)" }}>
                    {client.internalId}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              borderRadius: 6, padding: 6, background: "none", border: "none",
              cursor: "pointer", color: "var(--k-text-tertiary)", marginLeft: 8, flexShrink: 0,
            }}
          >
            <X style={{ width: 14, height: 14 }} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {/* KPI mini grid */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1,
            background: "var(--k-border-subtle)", border: "1px solid var(--k-border)",
            borderRadius: 8, overflow: "hidden", marginBottom: 20,
          }}>
            {[
              { l: t("detail.plan"),    v: client?.plan ?? "—" },
              { l: t("detail.tickets"), v: String(row.ticketCount) },
              { l: t("detail.csat"),    v: client?.csatAvg != null ? String(client.csatAvg) : "—" },
              { l: t("detail.lastSeen"), v: relativeTime(row.lastSeenAt) },
            ].map((kpi) => (
              <div key={kpi.l} style={{ background: "white", padding: 10 }}>
                <div style={{
                  fontSize: 10, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>{kpi.l}</div>
                <div style={{ fontSize: 14, fontWeight: 500, marginTop: 2, color: "var(--k-text-primary)" }}>{kpi.v}</div>
              </div>
            ))}
          </div>

          {row.organization && <DetailField label={t("detail.organization")} value={row.organization} />}
          {row.email && <DetailField label={t("detail.email")} value={row.email} />}
          {row.phone && <DetailField label={t("detail.phone")} value={row.phone} />}

          {/* CRM-only fields */}
          {client?.legalId && <DetailField label={t("detail.legalId")} value={client.legalId} />}

          {client && client.authorizedEmails.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{
                fontSize: 11, fontWeight: 500, color: "var(--k-text-tertiary)",
                textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8,
              }}>
                {t("detail.authorizedEmails")}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {client.authorizedEmails.map((email) => (
                  <span key={email} style={{
                    fontSize: 12, padding: "2px 8px", borderRadius: 999,
                    border: "1px solid var(--k-border)", color: "var(--k-text-secondary)",
                    fontFamily: "var(--k-font-mono)",
                  }}>
                    {email}
                  </span>
                ))}
              </div>
            </div>
          )}

          {client && client.contactPersons.length > 0 && (
            <div>
              <p style={{
                fontSize: 11, fontWeight: 500, color: "var(--k-text-tertiary)",
                textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8,
              }}>
                {t("detail.contactPersons")}
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {client.contactPersons.map((cp) => (
                  <div key={cp.name} style={{ borderRadius: 8, border: "1px solid var(--k-border)", padding: "8px 12px" }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--k-text-primary)", margin: 0 }}>{cp.name}</p>
                    <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", margin: 0 }}>{cp.role}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Draft action panel ── */}
          {isDraft && (
            <div style={{ marginTop: 20 }}>
              {/* Action error */}
              {actionError && (
                <div style={{
                  marginBottom: 10, padding: "8px 12px", borderRadius: 6, fontSize: 12,
                  background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA",
                }}>
                  {actionError}
                </div>
              )}

              {/* ── proposed + kairo_created: confirm / reject / edit ── */}
              {isProposed && isKairoCreated && !editMode && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={handleConfirm}
                      disabled={actionBusy}
                      style={{
                        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        padding: "9px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        background: "#16A34A", color: "white", border: "none",
                      }}
                    >
                      {actionBusy ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <Check style={{ width: 13, height: 13 }} />}
                      {t("actions.confirm")}
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={actionBusy}
                      style={{
                        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        padding: "9px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        background: "white", color: "#DC2626", border: "1px solid #FECACA",
                      }}
                    >
                      {actionBusy ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <XCircle style={{ width: 13, height: 13 }} />}
                      {t("actions.reject")}
                    </button>
                  </div>
                  <button
                    onClick={() => setEditMode(true)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      padding: "7px 14px", borderRadius: 7, fontSize: 13, cursor: "pointer",
                      background: "none", border: "none", color: "var(--k-text-secondary)", textDecoration: "underline",
                    }}
                  >
                    <Pencil style={{ width: 12, height: 12 }} />
                    {t("actions.edit")}
                  </button>
                </div>
              )}

              {/* ── proposed + kairo_created: edit mode ── */}
              {isProposed && isKairoCreated && editMode && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {(["display_name", "email", "phone", "organization"] as const).map((field) => (
                    <div key={field}>
                      <label style={{
                        display: "block", fontSize: 11, fontWeight: 500, color: "var(--k-text-tertiary)",
                        textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4,
                      }}>
                        {field === "display_name" ? "Nombre" : field === "email" ? t("detail.email") : field === "phone" ? t("detail.phone") : t("detail.organization")}
                      </label>
                      <input
                        value={editValues[field]}
                        onChange={(e) => setEditValues((v) => ({ ...v, [field]: e.target.value }))}
                        style={{
                          width: "100%", padding: "7px 10px", fontSize: 13, borderRadius: 6,
                          border: "1px solid var(--k-border)", outline: "none", boxSizing: "border-box",
                          color: "var(--k-text-primary)", background: "white",
                        }}
                      />
                    </div>
                  ))}
                  {editError && (
                    <div style={{ fontSize: 12, color: "#DC2626", padding: "6px 10px", background: "#FEF2F2", borderRadius: 6, border: "1px solid #FECACA" }}>
                      {editError}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      style={{
                        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        padding: "8px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        background: "#2B5BFF", color: "white", border: "none",
                      }}
                    >
                      {saving && <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />}
                      {t("actions.save")}
                    </button>
                    <button
                      onClick={() => { setEditMode(false); setEditError(null); }}
                      disabled={saving}
                      style={{
                        flex: 1, padding: "8px 14px", borderRadius: 6, fontSize: 13, cursor: "pointer",
                        background: "white", border: "1px solid var(--k-border)", color: "var(--k-text-secondary)",
                      }}
                    >
                      {t("actions.cancel")}
                    </button>
                  </div>
                </div>
              )}

              {/* ── proposed + external_synced: confirm/reject only, no edit ── */}
              {isProposed && !isKairoCreated && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <p style={{ fontSize: 11, color: "var(--k-text-tertiary)", margin: "0 0 4px", fontStyle: "italic" }}>
                    {t("actions.externalReadOnly", { source: row.externalSource ?? "external" })}
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={handleConfirm}
                      disabled={actionBusy}
                      style={{
                        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        padding: "9px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        background: "#16A34A", color: "white", border: "none",
                      }}
                    >
                      {actionBusy ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <Check style={{ width: 13, height: 13 }} />}
                      {t("actions.confirm")}
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={actionBusy}
                      style={{
                        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                        padding: "9px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer",
                        background: "white", color: "#DC2626", border: "1px solid #FECACA",
                      }}
                    >
                      {actionBusy ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <XCircle style={{ width: 13, height: 13 }} />}
                      {t("actions.reject")}
                    </button>
                  </div>
                </div>
              )}

              {/* ── rejected: re-activate ── */}
              {isRejected && (
                <button
                  onClick={handleUnreject}
                  disabled={actionBusy}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    padding: "9px 14px", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: "pointer",
                    background: "white", border: "1px solid var(--k-border)", color: "var(--k-text-secondary)",
                  }}
                >
                  {actionBusy ? <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" /> : <RotateCcw style={{ width: 13, height: 13 }} />}
                  {t("actions.reactivate")}
                </button>
              )}

              {/* ── confirmed: read-only with date ── */}
              {isConfirmed && (
                <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", margin: 0 }}>
                  {t("actions.confirmedOn", { date: row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleDateString() : "—" })}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// DetailField — small reusable label/value row inside the drawer
// ---------------------------------------------------------------------------

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{
        fontSize: 11, fontWeight: 500, color: "var(--k-text-tertiary)",
        textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4,
      }}>
        {label}
      </p>
      <p style={{ fontSize: 13, color: "var(--k-text-primary)", margin: 0, wordBreak: "break-word" }}>
        {value}
      </p>
    </div>
  );
}
