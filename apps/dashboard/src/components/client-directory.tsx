import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Download, Plus, MoreHorizontal, Loader2, X, Edit2, Trash2, SmilePlus, Meh, Frown } from "lucide-react";
import { ClientFormModal } from "@/components/client-form-modal";
import { apiCall } from "@/lib/api-client";
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

// Derive a consistent gradient from the client name (same palette as the design)
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
// KPI cards
// ---------------------------------------------------------------------------

function KpiStrip({ clients }: { clients: Client[] }) {
  const active    = clients.filter((c) => c.ticketCount > 0 || c.plan != null).length;
  const csatVals  = clients.map((c) => c.csatAvg).filter((v): v is number => v != null);
  const csatAvg   = csatVals.length ? (csatVals.reduce((a, b) => a + b, 0) / csatVals.length).toFixed(1) : "—";
  const churnRisk = clients.filter((c) => c.slaLevel === "Critical").length;

  const items = [
    { label: "MRR TOTAL",        value: "—",                    delta: null,         accent: undefined },
    { label: "ACTIVOS",          value: `${active} / ${clients.length}`, delta: null, accent: undefined },
    { label: "CSAT PROMEDIO",    value: csatAvg,                delta: null,         accent: undefined },
    { label: "RIESGO DE CHURN",  value: String(churnRisk),      delta: churnRisk > 0 ? `↑${churnRisk}` : null, accent: churnRisk > 0 ? "#EF4444" : undefined },
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
// Client row
// ---------------------------------------------------------------------------

function ClientRow({
  client,
  isLast,
  onSelect,
  onEdit,
  onDelete,
  deleting,
}: {
  client: Client;
  isLast: boolean;
  onSelect: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  deleting: boolean;
}) {
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const grad = avatarGradient(client.name);
  const ini  = initials(client.name);
  const primary = client.contactPersons[0];

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setMenuOpen(false); }}
      style={{
        display: "grid",
        gridTemplateColumns: "2.5fr 1fr 0.8fr 0.8fr 1fr 0.8fr 36px",
        padding: "12px 16px",
        borderBottom: isLast ? "none" : "1px solid var(--k-border-subtle)",
        alignItems: "center",
        fontSize: 13,
        cursor: "pointer",
        background: hover ? "var(--k-surface)" : "transparent",
        transition: "background 0.1s",
      }}
    >
      {/* CLIENTE */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
        <div style={{
          width: 32, height: 32, borderRadius: "50%", background: grad,
          color: "white", display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 600, fontSize: 11, flexShrink: 0,
        }}>
          {ini}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 500, color: "var(--k-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {client.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--k-text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {primary
              ? `${primary.name} · ${client.authorizedEmails[0] ?? ""}`
              : (client.authorizedEmails[0] ?? client.internalId)}
          </div>
        </div>
        {client.slaLevel === "Critical" && (
          <span style={{
            fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 999, flexShrink: 0,
            background: "#FEF2F2", color: "#EF4444", border: "1px solid #FECACA",
          }}>RIESGO</span>
        )}
      </div>

      {/* PLAN */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
          background: client.plan ? PLAN_DOT[client.plan] : "#A1A1AA",
        }} />
        <span>{client.plan ? PLAN_LABEL[client.plan] : "—"}</span>
      </div>

      {/* MRR */}
      <span style={{ fontFamily: "var(--k-font-mono)", color: "var(--k-text-secondary)" }}>—</span>

      {/* TICKETS */}
      <span style={{ fontFamily: "var(--k-font-mono)" }}>{client.ticketCount}</span>

      {/* CSAT */}
      <CsatCell value={client.csatAvg} />

      {/* ÚLTIMO CONTACTO */}
      <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 12, color: "var(--k-text-tertiary)" }}>
        {relativeTime(client.lastContactAt)}
      </span>

      {/* ACTIONS */}
      <div style={{ position: "relative" }}>
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
              onClick={(e) => { setMenuOpen(false); onEdit(e); }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", fontSize: 13, background: "none", border: "none", cursor: "pointer", color: "var(--k-text-primary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--k-surface)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <Edit2 style={{ width: 13, height: 13, color: "var(--k-text-tertiary)" }} /> Editar
            </button>
            <button
              onClick={(e) => { setMenuOpen(false); onDelete(e); }}
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
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClientDirectory
// ---------------------------------------------------------------------------

type FilterKey = "all" | "Enterprise" | "Pro" | "Starter" | "churn-risk";

export function ClientDirectory() {
  const { t } = useTranslation("clients");
  const [clients, setClients]           = useState<Client[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState<FilterKey>("all");
  const [selectedClient, setSelected]   = useState<Client | null>(null);
  const [formOpen, setFormOpen]         = useState(false);
  const [editingClient, setEditing]     = useState<Client | null>(null);
  const [deleting, setDeleting]         = useState<string | null>(null);

  useEffect(() => { fetchClients(); }, []);

  const fetchClients = async () => {
    try {
      const res  = await apiCall("/bff/clients");
      const data = await res.json();
      setClients((data.clients as Record<string, unknown>[]).map(mapRow));
    } catch {
      // leave empty on error
    } finally {
      setLoading(false);
    }
  };

  const handleSaved = (saved: Client) => {
    setClients((prev) => {
      const idx = prev.findIndex((c) => c.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
    if (selectedClient?.id === saved.id) setSelected(saved);
  };

  const handleDelete = async (client: Client, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!window.confirm(t("actions.confirmDelete", { name: client.name }))) return;
    setDeleting(client.id);
    try {
      await apiCall(`/bff/clients/${client.id}`, { method: "DELETE" });
      setClients((prev) => prev.filter((c) => c.id !== client.id));
      if (selectedClient?.id === client.id) setSelected(null);
    } catch { /* ignore */ }
    finally { setDeleting(null); }
  };

  const filtered = useMemo(() => {
    if (filter === "all")         return clients;
    if (filter === "churn-risk")  return clients.filter((c) => c.slaLevel === "Critical");
    return clients.filter((c) => c.plan === filter);
  }, [clients, filter]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, color: "var(--k-text-tertiary)" }}>
        <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
        {t("loading")}
      </div>
    );
  }

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all",        label: "Todos" },
    { key: "Enterprise", label: "Enterprise" },
    { key: "Pro",        label: "Pro" },
    { key: "Starter",    label: "Starter" },
    { key: "churn-risk", label: "Riesgo de churn" },
  ];

  const TABLE_HEADERS = ["CLIENTE", "PLAN", "MRR", "TICKETS", "CSAT", "ÚLTIMO CONTACTO", ""];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "white" }}>
      {/* Header */}
      <div style={{ padding: "24px 32px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, fontFamily: "var(--k-font-display)", color: "var(--k-text-primary)" }}>
            Clientes
          </h1>
          <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 13, color: "var(--k-text-tertiary)" }}>
            {clients.length}
          </span>
        </div>

        {/* KPI strip */}
        <KpiStrip clients={clients} />

        {/* Filters + actions */}
        <div style={{ display: "flex", gap: 6, marginTop: 24, alignItems: "center" }}>
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                padding: "5px 12px", borderRadius: 999, fontSize: 13, cursor: "pointer",
                background: filter === key ? "var(--k-text-primary)" : "white",
                color: filter === key ? "white" : "var(--k-text-secondary)",
                border: `1px solid ${filter === key ? "var(--k-text-primary)" : "var(--k-border)"}`,
              }}
            >
              {label}
            </button>
          ))}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
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
        {filtered.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, fontSize: 13, color: "var(--k-text-tertiary)" }}>
            {clients.length === 0 ? t("empty.noClients") : t("empty.noResults")}
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
            {filtered.map((client, idx) => (
              <ClientRow
                key={client.id}
                client={client}
                isLast={idx === filtered.length - 1}
                onSelect={() => setSelected(client)}
                onEdit={(e) => { e.stopPropagation(); setEditing(client); setFormOpen(true); }}
                onDelete={(e) => handleDelete(client, e)}
                deleting={deleting === client.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selectedClient && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: "fixed", inset: 0, zIndex: 30, background: "rgba(0,0,0,0.2)" }} />
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 40,
            width: 400, background: "white", boxShadow: "-4px 0 16px rgba(9,9,11,0.08)",
            overflowY: "auto", display: "flex", flexDirection: "column",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: "1px solid var(--k-border)", flexShrink: 0 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{
                  width: 40, height: 40, borderRadius: "50%",
                  background: avatarGradient(selectedClient.name),
                  color: "white", display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: 600, fontSize: 13, flexShrink: 0,
                }}>
                  {initials(selectedClient.name)}
                </div>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--k-text-primary)", fontFamily: "var(--k-font-display)", margin: 0 }}>
                    {selectedClient.name}
                  </h2>
                  <span style={{ fontSize: 11, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)" }}>
                    {selectedClient.internalId}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => { setEditing(selectedClient); setFormOpen(true); }} style={{ borderRadius: 6, padding: 6, background: "none", border: "none", cursor: "pointer", color: "var(--k-text-tertiary)" }}>
                  <Edit2 style={{ width: 14, height: 14 }} />
                </button>
                <button onClick={() => setSelected(null)} style={{ borderRadius: 6, padding: 6, background: "none", border: "none", cursor: "pointer", color: "var(--k-text-tertiary)", marginLeft: 4 }}>
                  <X style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
              {/* KPI mini grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--k-border-subtle)", border: "1px solid var(--k-border)", borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
                {[
                  { l: "Plan",     v: selectedClient.plan ?? "—" },
                  { l: "MRR",      v: "—" },
                  { l: "Tickets",  v: String(selectedClient.ticketCount) },
                  { l: "CSAT",     v: selectedClient.csatAvg != null ? String(selectedClient.csatAvg) : "—" },
                ].map((kpi) => (
                  <div key={kpi.l} style={{ background: "white", padding: 10 }}>
                    <div style={{ fontSize: 10, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{kpi.l}</div>
                    <div style={{ fontSize: 14, fontWeight: 500, marginTop: 2, color: "var(--k-text-primary)" }}>{kpi.v}</div>
                  </div>
                ))}
              </div>

              {selectedClient.telephone && (
                <DetailField label="Teléfono" value={selectedClient.telephone} />
              )}
              {selectedClient.legalId && (
                <DetailField label={t("detail.legalId")} value={selectedClient.legalId} />
              )}

              {selectedClient.authorizedEmails.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 11, fontWeight: 500, color: "var(--k-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                    {t("detail.authorizedEmails")}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {selectedClient.authorizedEmails.map((email) => (
                      <span key={email} style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--k-border)", color: "var(--k-text-secondary)", fontFamily: "var(--k-font-mono)" }}>
                        {email}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedClient.contactPersons.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 500, color: "var(--k-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                    {t("detail.contactPersons")}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {selectedClient.contactPersons.map((cp) => (
                      <div key={cp.name} style={{ borderRadius: 8, border: "1px solid var(--k-border)", padding: "8px 12px" }}>
                        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--k-text-primary)", margin: 0 }}>{cp.name}</p>
                        <p style={{ fontSize: 12, color: "var(--k-text-tertiary)", margin: 0 }}>{cp.role}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
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
// DetailField
// ---------------------------------------------------------------------------

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: "var(--k-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 13, color: "var(--k-text-primary)", margin: 0 }}>{value}</p>
    </div>
  );
}
