import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Search, Plus, Edit2, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ClientFormModal } from "@/components/client-form-modal";
import { apiCall } from "@/lib/api-client";
import type { Client, PlanType, SlaLevel, ContactPerson } from "@/types";

const planColors: Record<PlanType, string> = {
  Enterprise: "bg-violet-100 text-violet-800 hover:bg-violet-100",
  Pro: "bg-blue-100 text-blue-800 hover:bg-blue-100",
  Starter: "bg-gray-100 text-gray-800 hover:bg-gray-100",
};

const slaColors: Record<SlaLevel, string> = {
  Critical: "bg-red-100 text-red-800 hover:bg-red-100",
  High: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  Standard: "bg-green-100 text-green-800 hover:bg-green-100",
};

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
      const res = await apiCall("/api/clients");
      const data = await res.json();
      setClients(
        (data.clients as Record<string, unknown>[]).map(mapRow)
      );
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
    // Refresh detail sheet if it was the selected client
    if (selectedClient?.id === saved.id) setSelectedClient(saved);
  };

  const handleDelete = async (client: Client) => {
    const confirmed = window.confirm(
      t("actions.confirmDelete", { name: client.name })
    );
    if (!confirmed) return;

    setDeleting(client.id);
    try {
      await apiCall(`/api/clients/${client.id}`, { method: "DELETE" });
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
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("loading")}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <Building2 className="h-5 w-5 text-zinc-600" />
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <div className="relative ml-auto flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="pl-9"
            />
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("addClient")}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {filtered.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-zinc-400">
            {search.trim() ? t("empty.noResults") : t("empty.noClients")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("table.name")}</TableHead>
                <TableHead>{t("table.planType")}</TableHead>
                <TableHead>{t("table.slaLevel")}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((client) => (
                <TableRow
                  key={client.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedClient(client)}
                >
                  <TableCell>
                    <div className="font-medium">{client.name}</div>
                    <div className="text-xs text-zinc-400">{client.internalId}</div>
                  </TableCell>
                  <TableCell>
                    {client.plan && (
                      <Badge
                        variant="secondary"
                        className={planColors[client.plan]}
                      >
                        {client.plan}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {client.slaLevel && (
                      <Badge
                        variant="secondary"
                        className={slaColors[client.slaLevel]}
                      >
                        {client.slaLevel}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={(e) => openEdit(client, e)}
                      className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                      title={t("actions.edit")}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(client);
                      }}
                      disabled={deleting === client.id}
                      className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                      title={t("actions.delete")}
                    >
                      {deleting === client.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet
        open={selectedClient !== null}
        onOpenChange={(open) => !open && setSelectedClient(null)}
      >
        <SheetContent className="overflow-y-auto sm:max-w-md">
          {selectedClient && (
            <>
              <SheetHeader>
                <div className="flex items-start justify-between gap-2">
                  <SheetTitle>{selectedClient.name}</SheetTitle>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => openEdit(selectedClient)}
                      className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                      title={t("actions.edit")}
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(selectedClient)}
                      disabled={deleting === selectedClient.id}
                      className="rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                      title={t("actions.delete")}
                    >
                      {deleting === selectedClient.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <DetailField
                  label={t("detail.internalId")}
                  value={selectedClient.internalId}
                />
                <DetailField
                  label={t("detail.legalId")}
                  value={selectedClient.legalId}
                />
                <DetailField
                  label={t("detail.telephone")}
                  value={selectedClient.telephone}
                />

                {/* Plan & SLA */}
                {(selectedClient.plan || selectedClient.slaLevel) && (
                  <div className="flex gap-6">
                    {selectedClient.plan && (
                      <div>
                        <p className="text-xs font-medium text-zinc-500">
                          {t("detail.plan")}
                        </p>
                        <Badge
                          variant="secondary"
                          className={`mt-1 ${planColors[selectedClient.plan]}`}
                        >
                          {selectedClient.plan}
                        </Badge>
                      </div>
                    )}
                    {selectedClient.slaLevel && (
                      <div>
                        <p className="text-xs font-medium text-zinc-500">
                          {t("detail.sla")}
                        </p>
                        <Badge
                          variant="secondary"
                          className={`mt-1 ${slaColors[selectedClient.slaLevel]}`}
                        >
                          {selectedClient.slaLevel}
                        </Badge>
                      </div>
                    )}
                  </div>
                )}

                {/* Authorized Emails */}
                {selectedClient.authorizedEmails.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-zinc-500">
                      {t("detail.authorizedEmails")}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {selectedClient.authorizedEmails.map((email) => (
                        <Badge key={email} variant="outline" className="text-xs">
                          {email}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contact Persons */}
                {selectedClient.contactPersons.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-zinc-500">
                      {t("detail.contactPersons")}
                    </p>
                    <div className="mt-2 space-y-2">
                      {selectedClient.contactPersons.map((cp) => (
                        <div key={cp.name} className="rounded-md border px-3 py-2">
                          <p className="text-sm font-medium">{cp.name}</p>
                          <p className="text-xs text-zinc-500">{cp.role}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

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

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}
