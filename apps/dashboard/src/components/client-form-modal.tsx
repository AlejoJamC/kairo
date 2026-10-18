import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button, Dialog, Field, FieldInput, FieldSelect, FieldTextarea, Icon, IconButton } from "@kairo/ui";
import { saveClient } from "@kairo/client-core/endpoints";
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
    // Enriched fields are computed by the BFF list query; default to 0/null after create/edit
    ticketCount: (row.ticketCount as number) ?? 0,
    csatAvg: (row.csatAvg as number | null) ?? null,
    lastContactAt: (row.lastContactAt as string | null) ?? null,
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
  const [baseline, setBaseline] = useState<FormState>(emptyForm);

  useEffect(() => {
    if (!isOpen) return;
    if (client) {
      const loaded: FormState = {
        internal_id: client.internalId,
        name: client.name,
        legal_id: client.legalId ?? "",
        telephone: client.telephone ?? "",
        plan_type: client.plan ?? "",
        sla_level: client.slaLevel ?? "",
        emails: client.authorizedEmails.join("\n"),
        contactPersons: client.contactPersons.map((cp) => ({ ...cp })),
      };
      setForm(loaded);
      setBaseline(loaded);
    } else {
      setForm(emptyForm);
      setBaseline(emptyForm);
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

  const handleSubmit = async () => {
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
      const res = await saveClient(isEdit ? client!.id : null, payload);

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

  const dirty = saving || JSON.stringify(form) !== JSON.stringify(baseline);

  return (
    <Dialog
      open
      onOpenChange={(next) => { if (!next) onClose(); }}
      title={client ? t("form.editTitle") : t("form.createTitle")}
      maxWidth={520}
      dirty={dirty}
      footer={
        <>
          <Button variant="ghost" size="sm" onPress={onClose}>
            {t("form.cancelButton")}
          </Button>
          <Button variant="primary" size="sm" loading={saving} loadingLabel={t("form.savingButton")} onPress={handleSubmit}>
            {t("form.saveButton")}
          </Button>
        </>
      }
    >
      {error && (
        <div role="alert" style={{ borderRadius: 6, background: "var(--kairo-color-bad-soft)", border: "1px solid var(--kairo-color-bad-line)", padding: "8px 12px", fontSize: 13, color: "var(--kairo-color-bad-ink)" }}>
          {error}
        </div>
      )}

      {/* Internal ID & Name */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label={`${t("form.internalIdLabel")} *`}>
          <FieldInput
            value={form.internal_id}
            onChangeText={(text) => set("internal_id", text)}
            placeholder={t("form.internalIdPlaceholder")}
            disabled={!!client}
          />
        </Field>
        <Field label={`${t("form.nameLabel")} *`}>
          <FieldInput value={form.name} onChangeText={(text) => set("name", text)} placeholder={t("form.namePlaceholder")} />
        </Field>
      </div>

      {/* Legal ID & Telephone */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label={t("form.legalIdLabel")}>
          <FieldInput value={form.legal_id} onChangeText={(text) => set("legal_id", text)} placeholder={t("form.legalIdPlaceholder")} />
        </Field>
        <Field label={t("form.telephoneLabel")}>
          <FieldInput value={form.telephone} onChangeText={(text) => set("telephone", text)} placeholder={t("form.telephonePlaceholder")} />
        </Field>
      </div>

      {/* Plan & SLA */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label={t("form.planLabel")}>
          <FieldSelect value={form.plan_type} onValueChange={(next) => set("plan_type", next as PlanType | "")}>
            <option value="">{t("form.planPlaceholder")}</option>
            <option value="Enterprise">Enterprise</option>
            <option value="Pro">Pro</option>
            <option value="Starter">Starter</option>
          </FieldSelect>
        </Field>
        <Field label={t("form.slaLabel")}>
          <FieldSelect value={form.sla_level} onValueChange={(next) => set("sla_level", next as SlaLevel | "")}>
            <option value="">{t("form.slaPlaceholder")}</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Standard">Standard</option>
          </FieldSelect>
        </Field>
      </div>

      {/* Authorized Emails */}
      <Field label={t("form.authorizedEmailsLabel")}>
        <FieldTextarea
          value={form.emails}
          onChangeText={(text) => set("emails", text)}
          placeholder={t("form.emailPlaceholder")}
          rows={3}
        />
      </Field>

      {/* Contact Persons */}
      <div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontFamily: "var(--k-font-mono)", fontSize: 10.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--k-text-tertiary)" }}>
            {t("form.contactPersonsLabel")}
          </span>
          <Button variant="link" icon={<Icon name="plus" size={12} color="var(--k-accent)" />} onPress={addPerson}>
            {t("form.addPerson")}
          </Button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {form.contactPersons.map((cp, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <Field label={t("form.personNamePlaceholder")} hideLabel>
                <FieldInput value={cp.name} onChangeText={(text) => updatePerson(i, "name", text)} placeholder={t("form.personNamePlaceholder")} />
              </Field>
              <Field label={t("form.personRolePlaceholder")} hideLabel>
                <FieldInput value={cp.role} onChangeText={(text) => updatePerson(i, "role", text)} placeholder={t("form.personRolePlaceholder")} />
              </Field>
              <IconButton label={t("form.removePerson")} onPress={() => removePerson(i)}>
                <Icon name="trash" size={14} color="var(--k-text-tertiary)" />
              </IconButton>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
