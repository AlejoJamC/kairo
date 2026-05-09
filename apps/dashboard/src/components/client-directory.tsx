import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Search, Plus, Edit2, Trash2, Loader2, X } from "lucide-react";
import { Input } from "@kairo/ui";
import { ClientFormModal } from "@/components/client-form-modal";
import { apiCall } from "@/lib/api-client";
import type { Client, PlanType, SlaLevel, ContactPerson } from "@/types";

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

const planStyle: Record<PlanType, { bg: string; color: string }> = {
  Enterprise: { bg: "#F3F0FF", color: "#6D28D9" },
  Pro:        { bg: "#EEF2FF", color: "#2B5BFF" },
  Starter:    { bg: "#F4F4F5", color: "#52525B" },
};

const slaStyle: Record<SlaLevel, { bg: string; color: string }> = {
  Critical: { bg: "#FEF2F2", color: "#DC2626" },
  High:     { bg: "#FFFBEB", color: "#B45309" },
  Standard: { bg: "#ECFDF5", color: "#047857" },
};

function PlanBadge({ plan }: { plan: PlanType }) {
  const s = planStyle[plan];
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 999, background: s.bg, color: s.color }}>
      {plan}
    </span>
  );
}

function SlaBadge({ level }: { level: SlaLevel }) {
  const s = slaStyle[level];
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 7px", borderRadius: 999, background: s.bg, color: s.color }}>
      {level}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRow(row: Record<string, unknown>): Client {
  return {
    id: row.id as string,
    internalId: row.internal_id as string,
    legalId: (row.legal_id as string | null) ?? null,
    name: row.name as string,
    telephone: (row.telephone as string | null) ?? null,
    authorizedEmails: (row.authorized_emails as string[]) ?? [],
    contactPersons: (row.contact_persons as ContactPerson[]) ?? [],
    plan: (row.plan_type as PlanType | null) ?? null,
    slaLevel: (row.sla_level as SlaLevel | null) ?? null,
  };
}

// ---------------------------------------------------------------------------
// ClientDirectory
// ---------------------------------------------------------------------------

export function ClientDirectory() {
  const { t } = useTranslation("clients");
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const res = await apiCall("/bff/clients");
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
      const exists = prev.findIndex((c) => c.id === saved.id);
      if (exists >= 0) {
        const next = [...prev];
        next[exists] = saved;
        return next;
      }
      return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
    if (selectedClient?.id === saved.id) setSelectedClient(saved);
  };

  const handleDelete = async (client: Client) => {
    const confirmed = window.confirm(t("actions.confirmDelete", { name: client.name }));
    if (!confirmed) return;

    setDeleting(client.id);
    try {
      await apiCall(`/bff/clients/${client.id}`, { method: "DELETE" });
      setClients((prev) => prev.filter((c) => c.id !== client.id));
      if (selectedClient?.id === client.id) setSelectedClient(null);
    } catch {
      // ignore — user can retry
    } finally {
      setDeleting(null);
    }
  };

  const openCreate = () => {
    setEditingClient(null);
    setFormOpen(true);
  };

  const openEdit = (client: Client, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingClient(client);
    setFormOpen(true);
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.internalId.toLowerCase().includes(q)
    );
  }, [clients, search]);

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontSize: 13, color: "var(--k-text-tertiary)" }}>
        <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />
        {t("loading")}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--k-surface)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--k-border)", background: "white", padding: "16px 24px", flexShrink: 0 }}>
        <Building2 style={{ width: 18, height: 18, color: "var(--k-text-tertiary)" }} />
        <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--k-text-primary)", letterSpacing: "-0.01em", fontFamily: "var(--k-font-display)", margin: 0 }}>
          {t("title")}
        </h1>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {/* Search */}
          <div style={{ position: "relative", width: 240 }}>
            <Search style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "var(--k-text-tertiary)" }} />
            <Input
              value={search}
              onChangeText={(text) => setSearch(text)}
              placeholder={t("searchPlaceholder")}
              style={{ paddingLeft: 30 }}
            />
          </div>
          <button
            onClick={openCreate}
            className="k-btn-primary"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            {t("addClient")}
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {filtered.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, fontSize: 13, color: "var(--k-text-tertiary)" }}>
            {search.trim() ? t("empty.noResults") : t("empty.noClients")}
          </div>
        ) : (
          <div style={{ borderRadius: 10, border: "1px solid var(--k-border)", background: "white", overflow: "hidden", boxShadow: "0 1px 2px rgba(9,9,11,0.04)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--k-border)" }}>
                  {[t("table.name"), t("table.planType"), t("table.slaLevel"), ""].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: "9px 16px",
                        textAlign: "left",
                        fontSize: 11,
                        fontWeight: 500,
                        color: "var(--k-text-tertiary)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        background: "var(--k-surface)",
                        width: i === 3 ? 80 : undefined,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((client, idx) => (
                  <tr
                    key={client.id}
                    onClick={() => setSelectedClient(client)}
                    style={{
                      cursor: "pointer",
                      borderBottom: idx < filtered.length - 1 ? "1px solid var(--k-border-subtle)" : "none",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--k-surface)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--k-text-primary)" }}>{client.name}</div>
                      <div style={{ fontSize: 11, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)", marginTop: 1 }}>{client.internalId}</div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {client.plan && <PlanBadge plan={client.plan} />}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      {client.slaLevel && <SlaBadge level={client.slaLevel} />}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <button
                        onClick={(e) => openEdit(client, e)}
                        title={t("actions.edit")}
                        style={{ borderRadius: 6, padding: 5, background: "none", border: "none", cursor: "pointer", color: "var(--k-text-tertiary)", marginRight: 2 }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--k-surface-2)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--k-text-secondary)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; (e.currentTarget as HTMLButtonElement).style.color = "var(--k-text-tertiary)"; }}
                      >
                        <Edit2 style={{ width: 13, height: 13 }} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(client); }}
                        disabled={deleting === client.id}
                        title={t("actions.delete")}
                        style={{ borderRadius: 6, padding: 5, background: "none", border: "none", cursor: "pointer", color: "var(--k-text-tertiary)", opacity: deleting === client.id ? 0.5 : 1 }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#FEF2F2"; (e.currentTarget as HTMLButtonElement).style.color = "#DC2626"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; (e.currentTarget as HTMLButtonElement).style.color = "var(--k-text-tertiary)"; }}
                      >
                        {deleting === client.id ? (
                          <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />
                        ) : (
                          <Trash2 style={{ width: 13, height: 13 }} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Panel (slide-in from right) */}
      {selectedClient && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setSelectedClient(null)}
            style={{ position: "fixed", inset: 0, zIndex: 30, background: "rgba(0,0,0,0.2)" }}
          />
          {/* Panel */}
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 40,
            width: 400, background: "white", boxShadow: "-4px 0 16px rgba(9,9,11,0.08)",
            overflowY: "auto", display: "flex", flexDirection: "column",
          }}>
            {/* Panel header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "20px 24px 16px", borderBottom: "1px solid var(--k-border)", flexShrink: 0 }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--k-text-primary)", fontFamily: "var(--k-font-display)", margin: 0 }}>
                  {selectedClient.name}
                </h2>
                <span style={{ fontSize: 11, fontFamily: "var(--k-font-mono)", color: "var(--k-text-tertiary)" }}>
                  {selectedClient.internalId}
                </span>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button
                  onClick={() => openEdit(selectedClient)}
                  title={t("actions.edit")}
                  style={{ borderRadius: 6, padding: 6, background: "none", border: "none", cursor: "pointer", color: "var(--k-text-tertiary)" }}
                >
                  <Edit2 style={{ width: 14, height: 14 }} />
                </button>
                <button
                  onClick={() => handleDelete(selectedClient)}
                  disabled={deleting === selectedClient.id}
                  title={t("actions.delete")}
                  style={{ borderRadius: 6, padding: 6, background: "none", border: "none", cursor: "pointer", color: "var(--k-text-tertiary)", opacity: deleting === selectedClient.id ? 0.5 : 1 }}
                >
                  {deleting === selectedClient.id ? (
                    <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
                  ) : (
                    <Trash2 style={{ width: 14, height: 14 }} />
                  )}
                </button>
                <button
                  onClick={() => setSelectedClient(null)}
                  style={{ borderRadius: 6, padding: 6, background: "none", border: "none", cursor: "pointer", color: "var(--k-text-tertiary)", marginLeft: 4 }}
                >
                  <X style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>

            {/* Panel body */}
            <div style={{ flex: 1, overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
              <DetailField label={t("detail.internalId")} value={selectedClient.internalId} mono />
              <DetailField label={t("detail.legalId")} value={selectedClient.legalId} />
              <DetailField label={t("detail.telephone")} value={selectedClient.telephone} />

              {/* Plan & SLA */}
              {(selectedClient.plan || selectedClient.slaLevel) && (
                <div style={{ display: "flex", gap: 24 }}>
                  {selectedClient.plan && (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 500, color: "var(--k-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                        {t("detail.plan")}
                      </p>
                      <PlanBadge plan={selectedClient.plan} />
                    </div>
                  )}
                  {selectedClient.slaLevel && (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 500, color: "var(--k-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>
                        {t("detail.sla")}
                      </p>
                      <SlaBadge level={selectedClient.slaLevel} />
                    </div>
                  )}
                </div>
              )}

              {/* Authorized Emails */}
              {selectedClient.authorizedEmails.length > 0 && (
                <div>
                  <p style={{ fontSize: 11, fontWeight: 500, color: "var(--k-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
                    {t("detail.authorizedEmails")}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {selectedClient.authorizedEmails.map((email) => (
                      <span
                        key={email}
                        style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, border: "1px solid var(--k-border)", color: "var(--k-text-secondary)", fontFamily: "var(--k-font-mono)" }}
                      >
                        {email}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Contact Persons */}
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

      {/* Create / Edit Modal */}
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

function DetailField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 500, color: "var(--k-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>
        {label}
      </p>
      <p style={{ fontSize: 13, color: "var(--k-text-primary)", fontFamily: mono ? "var(--k-font-mono)" : undefined, margin: 0 }}>
        {value}
      </p>
    </div>
  );
}
