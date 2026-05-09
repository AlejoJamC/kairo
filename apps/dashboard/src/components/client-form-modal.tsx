import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Plus, Trash2, Loader2 } from "lucide-react";
import { Input } from "@kairo/ui";
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
        isEdit ? `/bff/clients/${client!.id}` : "/bff/clients",
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
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)" }}>
      <div style={{ position: "relative", width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto", borderRadius: 12, background: "white", boxShadow: "0 4px 16px rgba(9,9,11,0.08), 0 1px 2px rgba(9,9,11,0.04)" }}>
        {/* Header */}
        <div style={{ position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--k-border)", background: "white", padding: "16px 24px" }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--k-text-primary)", fontFamily: "var(--k-font-display)", margin: 0 }}>
            {client ? t("form.editTitle") : t("form.createTitle")}
          </h2>
          <button
            onClick={onClose}
            style={{ borderRadius: 6, padding: 4, background: "none", border: "none", cursor: "pointer", color: "var(--k-text-tertiary)" }}
            type="button"
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16, padding: 24 }}>
          {error && (
            <div style={{ borderRadius: 6, background: "#FEF2F2", border: "1px solid #FECACA", padding: "8px 12px", fontSize: 13, color: "#991B1B" }}>
              {error}
            </div>
          )}

          {/* Internal ID & Name */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label className="k-label">{t("form.internalIdLabel")} *</label>
              <Input
                value={form.internal_id}
                onChangeText={(text) => set("internal_id", text)}
                placeholder={t("form.internalIdPlaceholder")}
                disabled={!!client}
              />
            </div>
            <div>
              <label className="k-label">{t("form.nameLabel")} *</label>
              <Input value={form.name} onChangeText={(text) => set("name", text)} placeholder={t("form.namePlaceholder")} />
            </div>
          </div>

          {/* Legal ID & Telephone */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label className="k-label">{t("form.legalIdLabel")}</label>
              <Input value={form.legal_id} onChangeText={(text) => set("legal_id", text)} placeholder={t("form.legalIdPlaceholder")} />
            </div>
            <div>
              <label className="k-label">{t("form.telephoneLabel")}</label>
              <Input value={form.telephone} onChangeText={(text) => set("telephone", text)} placeholder={t("form.telephonePlaceholder")} />
            </div>
          </div>

          {/* Plan & SLA */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label className="k-label">{t("form.planLabel")}</label>
              <select className="k-select" value={form.plan_type} onChange={(e) => set("plan_type", e.target.value as PlanType | "")}>
                <option value="">{t("form.planPlaceholder")}</option>
                <option value="Enterprise">Enterprise</option>
                <option value="Pro">Pro</option>
                <option value="Starter">Starter</option>
              </select>
            </div>
            <div>
              <label className="k-label">{t("form.slaLabel")}</label>
              <select className="k-select" value={form.sla_level} onChange={(e) => set("sla_level", e.target.value as SlaLevel | "")}>
                <option value="">{t("form.slaPlaceholder")}</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Standard">Standard</option>
              </select>
            </div>
          </div>

          {/* Authorized Emails */}
          <div>
            <label className="k-label">{t("form.authorizedEmailsLabel")}</label>
            <textarea
              className="k-textarea"
              value={form.emails}
              onChange={(e) => set("emails", e.target.value)}
              placeholder={t("form.emailPlaceholder")}
              rows={3}
            />
          </div>

          {/* Contact Persons */}
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <label className="k-label" style={{ margin: 0 }}>{t("form.contactPersonsLabel")}</label>
              <button
                type="button"
                onClick={addPerson}
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--k-accent)", background: "none", border: "none", cursor: "pointer" }}
              >
                <Plus style={{ width: 12, height: 12 }} />
                {t("form.addPerson")}
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {form.contactPersons.map((cp, i) => (
                <div key={i} style={{ display: "flex", gap: 8 }}>
                  <Input value={cp.name} onChangeText={(text) => updatePerson(i, "name", text)} placeholder={t("form.personNamePlaceholder")} />
                  <Input value={cp.role} onChangeText={(text) => updatePerson(i, "role", text)} placeholder={t("form.personRolePlaceholder")} />
                  <button
                    type="button"
                    onClick={() => removePerson(i)}
                    style={{ borderRadius: 6, padding: 6, background: "none", border: "none", cursor: "pointer", color: "var(--k-text-tertiary)", flexShrink: 0 }}
                  >
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--k-border-subtle)", paddingTop: 16 }}>
            <button type="button" onClick={onClose} className="k-btn-secondary">
              {t("form.cancelButton")}
            </button>
            <button type="submit" disabled={saving} className="k-btn-primary">
              {saving && <Loader2 style={{ width: 13, height: 13 }} className="animate-spin" />}
              {saving ? t("form.savingButton") : t("form.saveButton")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
