import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Plus, Trash2, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { apiCall } from "@/lib/api-client";
import type { Client, PlanType, SlaLevel, ContactPerson } from "@/types";

interface Props {
  isOpen: boolean;
  client: Client | null; // null = create, non-null = edit
  onClose: () => void;
  onSaved: (client: Client) => void;
}

interface FormState {
  internal_id: string;
  name: string;
  legal_id: string;
  telephone: string;
  plan_type: PlanType | "";
  sla_level: SlaLevel | "";
  emails: string; // one email per line
  contactPersons: ContactPerson[];
}

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

const emptyForm: FormState = {
  internal_id: "",
  name: "",
  legal_id: "",
  telephone: "",
  plan_type: "",
  sla_level: "",
  emails: "",
  contactPersons: [],
};

export function ClientFormModal({ isOpen, client, onClose, onSaved }: Props) {
  const { t } = useTranslation("clients");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  useEffect(() => {
    if (!isOpen) return;
    if (client) {
      setForm({
        internal_id: client.internalId,
        name: client.name,
        legal_id: client.legalId ?? "",
        telephone: client.telephone ?? "",
        plan_type: client.plan ?? "",
        sla_level: client.slaLevel ?? "",
        emails: client.authorizedEmails.join("\n"),
        contactPersons: client.contactPersons.map((cp) => ({ ...cp })),
      });
    } else {
      setForm(emptyForm);
    }
    setError(null);
  }, [client, isOpen]);

  if (!isOpen) return null;

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [field]: value }));

  const addPerson = () =>
    setForm((f) => ({
      ...f,
      contactPersons: [...f.contactPersons, { name: "", role: "" }],
    }));

  const removePerson = (i: number) =>
    setForm((f) => ({
      ...f,
      contactPersons: f.contactPersons.filter((_, idx) => idx !== i),
    }));

  const updatePerson = (i: number, field: keyof ContactPerson, value: string) =>
    setForm((f) => ({
      ...f,
      contactPersons: f.contactPersons.map((cp, idx) =>
        idx === i ? { ...cp, [field]: value } : cp
      ),
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.internal_id.trim() || !form.name.trim()) {
      setError(t("form.requiredError"));
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      internal_id: form.internal_id.trim(),
      name: form.name.trim(),
      legal_id: form.legal_id.trim() || null,
      telephone: form.telephone.trim() || null,
      plan_type: form.plan_type || null,
      sla_level: form.sla_level || null,
      authorized_emails: form.emails
        .split("\n")
        .map((e) => e.trim())
        .filter(Boolean),
      contact_persons: form.contactPersons.filter((cp) => cp.name.trim()),
    };

    try {
      const isEdit = client !== null;
      const res = await apiCall(
        isEdit ? `/api/clients/${client!.id}` : "/api/clients",
        { method: isEdit ? "PATCH" : "POST", body: JSON.stringify(payload) }
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? t("form.saveError"));
        return;
      }

      onSaved(mapRow(data.client as Record<string, unknown>));
      onClose();
    } catch {
      setError(t("form.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
          <h2 className="text-base font-semibold text-zinc-900">
            {client ? t("form.editTitle") : t("form.createTitle")}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 hover:bg-zinc-100"
            type="button"
          >
            <X className="h-4 w-4 text-zinc-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          {error && (
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Internal ID & Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                {t("form.internalIdLabel")} *
              </label>
              <Input
                value={form.internal_id}
                onChange={(e) => set("internal_id", e.target.value)}
                placeholder={t("form.internalIdPlaceholder")}
                disabled={!!client}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                {t("form.nameLabel")} *
              </label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder={t("form.namePlaceholder")}
              />
            </div>
          </div>

          {/* Legal ID & Telephone */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                {t("form.legalIdLabel")}
              </label>
              <Input
                value={form.legal_id}
                onChange={(e) => set("legal_id", e.target.value)}
                placeholder={t("form.legalIdPlaceholder")}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                {t("form.telephoneLabel")}
              </label>
              <Input
                value={form.telephone}
                onChange={(e) => set("telephone", e.target.value)}
                placeholder={t("form.telephonePlaceholder")}
              />
            </div>
          </div>

          {/* Plan & SLA */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                {t("form.planLabel")}
              </label>
              <select
                value={form.plan_type}
                onChange={(e) => set("plan_type", e.target.value as PlanType | "")}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">{t("form.planPlaceholder")}</option>
                <option value="Enterprise">Enterprise</option>
                <option value="Pro">Pro</option>
                <option value="Starter">Starter</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-600">
                {t("form.slaLabel")}
              </label>
              <select
                value={form.sla_level}
                onChange={(e) => set("sla_level", e.target.value as SlaLevel | "")}
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">{t("form.slaPlaceholder")}</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Standard">Standard</option>
              </select>
            </div>
          </div>

          {/* Authorized Emails */}
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              {t("form.authorizedEmailsLabel")}
            </label>
            <textarea
              value={form.emails}
              onChange={(e) => set("emails", e.target.value)}
              placeholder={t("form.emailPlaceholder")}
              rows={3}
              className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Contact Persons */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-zinc-600">
                {t("form.contactPersonsLabel")}
              </label>
              <button
                type="button"
                onClick={addPerson}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <Plus className="h-3 w-3" />
                {t("form.addPerson")}
              </button>
            </div>
            <div className="space-y-2">
              {form.contactPersons.map((cp, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    value={cp.name}
                    onChange={(e) => updatePerson(i, "name", e.target.value)}
                    placeholder={t("form.personNamePlaceholder")}
                    className="flex-1"
                  />
                  <Input
                    value={cp.role}
                    onChange={(e) => updatePerson(i, "role", e.target.value)}
                    placeholder={t("form.personRolePlaceholder")}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removePerson(i)}
                    className="rounded p-2 text-zinc-400 hover:bg-zinc-100 hover:text-red-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-zinc-600 hover:text-zinc-900"
            >
              {t("form.cancelButton")}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? t("form.savingButton") : t("form.saveButton")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
