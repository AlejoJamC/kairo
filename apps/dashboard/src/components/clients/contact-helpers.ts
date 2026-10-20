import type { Client, PlanType, SlaLevel, ContactPerson } from "@/types";
import { type KpiItem } from "@kairo/ui";

export const PLAN_DOT: Record<string, string> = {
  Enterprise: "var(--kairo-color-accent)",
  Pro:        "var(--kairo-color-accent)",
  Starter:    "var(--kairo-color-faint)",
};

export const PLAN_LABEL: Record<string, string> = {
  Enterprise: "Enterprise",
  Pro:        "Pro",
  Starter:    "Starter",
};

export function relativeTime(iso: string | null): string {
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

export function mapRow(row: Record<string, unknown>): Client {
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

export function clientKpis(clients: Client[]): KpiItem[] {
  const active = clients.filter((c) => c.ticketCount > 0 || c.plan != null).length;
  const csatVals = clients.map((c) => c.csatAvg).filter((v): v is number => v != null);
  const csatAvg = csatVals.length ? (csatVals.reduce((a, b) => a + b, 0) / csatVals.length).toFixed(1) : null;
  const churnRisk = clients.filter((c) => c.slaLevel === "Critical").length;

  return [
    { label: "MRR TOTAL", value: null },
    { label: "ACTIVOS", value: `${active} / ${clients.length}` },
    { label: "CSAT PROMEDIO", value: csatAvg },
    { label: "RIESGO DE CHURN", value: churnRisk, urgent: churnRisk > 0 },
  ];
}
