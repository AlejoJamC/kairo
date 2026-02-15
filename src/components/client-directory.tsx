import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Search } from "lucide-react";
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
import { clients } from "@/data/dummy-data";
import type { Client, PlanType, SlaLevel } from "@/types";

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

export function ClientDirectory() {
  const { t } = useTranslation("clients");
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return clients;
    const q = search.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.internalId.toLowerCase().includes(q)
    );
  }, [search]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-6 py-4">
        <Building2 className="h-5 w-5 text-zinc-600" />
        <h1 className="text-lg font-semibold">{t("title")}</h1>
        <div className="relative ml-auto w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="pl-9"
          />
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((client) => (
                <TableRow
                  key={client.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedClient(client)}
                >
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={planColors[client.plan]}>
                      {client.plan}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={slaColors[client.slaLevel]}>
                      {client.slaLevel}
                    </Badge>
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
                <SheetTitle>{selectedClient.name}</SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-5">
                <DetailField label={t("detail.internalId")} value={selectedClient.internalId} />
                <DetailField label={t("detail.legalId")} value={selectedClient.legalId} />
                <DetailField label={t("detail.telephone")} value={selectedClient.telephone} />

                {/* Plan & SLA */}
                <div className="flex gap-6">
                  <div>
                    <p className="text-xs font-medium text-zinc-500">{t("detail.plan")}</p>
                    <Badge variant="secondary" className={`mt-1 ${planColors[selectedClient.plan]}`}>
                      {selectedClient.plan}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-zinc-500">{t("detail.sla")}</p>
                    <Badge variant="secondary" className={`mt-1 ${slaColors[selectedClient.slaLevel]}`}>
                      {selectedClient.slaLevel}
                    </Badge>
                  </div>
                </div>

                {/* Authorized Emails */}
                <div>
                  <p className="text-xs font-medium text-zinc-500">{t("detail.authorizedEmails")}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {selectedClient.authorizedEmails.map((email) => (
                      <Badge key={email} variant="outline" className="text-xs">
                        {email}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Contact Persons */}
                <div>
                  <p className="text-xs font-medium text-zinc-500">{t("detail.contactPersons")}</p>
                  <div className="mt-2 space-y-2">
                    {selectedClient.contactPersons.map((cp) => (
                      <div key={cp.name} className="rounded-md border px-3 py-2">
                        <p className="text-sm font-medium">{cp.name}</p>
                        <p className="text-xs text-zinc-500">{cp.role}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}
