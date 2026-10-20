// Client and Escalate tabs of the context panel, wired to the open ticket.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getSimilarTickets, escalateTicket } from "@kairo/client-core/endpoints";
import { fetchTicketById } from "@kairo/client-core/queries";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { computeTicketOperationalSla, type Ticket } from "@kairo/types";
import { useActiveView } from "@/hooks/useActiveView";
import { formatCompactDuration, formatDuration, slaDisplay } from "@/lib/sla-display";
import type { AppView } from "@/types";
import { ClientPanel, EscalatePanel, type EscalateSignal, type SignalTone, type SourceItem } from "@kairo/ui";
import type { SimilarTicketRow } from "@/components/ticket-list-helpers";

function viewForStatus(status: string): AppView {
  if (status === "resolved" || status === "ai_resolved" || status === "closed") return "resolved";
  if (status === "awaiting_customer") return "awaiting";
  if (status === "escalated") return "escalated";
  return "triage";
}

// ---------------------------------------------------------------------------
// Client tab
// ---------------------------------------------------------------------------

export function ClientTabContainer({ loading }: { loading: boolean }) {
  const { t, i18n } = useTranslation("dashboard");
  const clientProfile = useTriageStore((s) => s.clientProfile);
  const selectedTicketId = useTriageStore((s) => s.selectedTicketId);
  const ticket = useTriageStore((s) => s.tickets.find((entry) => entry.id === s.selectedTicketId) ?? null);
  const upsertTicket = useTriageStore((s) => s.upsertTicket);
  const selectTicket = useTriageStore((s) => s.selectTicket);
  const [, setView] = useActiveView();
  // Similar tickets of the open ticket; a result for another ticket is ignored.
  const [similarFor, setSimilarFor] = useState<{ ticketId: string; rows: SimilarTicketRow[] } | null>(null);
  const similar = similarFor && similarFor.ticketId === selectedTicketId ? similarFor.rows : [];
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!selectedTicketId) return;
    let cancelled = false;
    getSimilarTickets(selectedTicketId)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { data?: SimilarTicketRow[]; degraded?: boolean } | null) => {
        if (!cancelled && body && !body.degraded && body.data) setSimilarFor({ ticketId: selectedTicketId, rows: body.data.filter((row) => row.ticket_id !== selectedTicketId) });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedTicketId]);

  // Opens a ticket in its own queue without changing the panel tab.
  async function open(ticketId: string, status: string | null) {
    const { tickets } = useTriageStore.getState();
    let target = tickets.find((entry) => entry.id === ticketId) ?? null;
    if (!target) {
      target = await fetchTicketById(ticketId);
      if (target) upsertTicket(target);
    }
    setView(viewForStatus(status ?? target?.status ?? "open"));
    selectTicket(ticketId);
  }

  const dateLocale = i18n.language === "en" ? "en-US" : "es-ES";
  const otherTickets: SourceItem[] = useMemo(
    () =>
      (clientProfile?.recentTickets ?? [])
        .filter((entry) => entry.id !== selectedTicketId)
        .map((entry) => {
          const ageDays = Math.floor((now - new Date(entry.created_at).getTime()) / 86_400_000);
          const meta =
            entry.status === "resolved" || entry.status === "ai_resolved" ? t("clientPanel.resolved")
            : entry.status === "awaiting_customer" ? t("clientPanel.awaiting")
            : `${ageDays}d`;
          return { id: entry.id, kind: "compact" as const, code: `KAI-${entry.ticket_number}`, title: entry.subject ?? "—", meta, onOpen: () => void open(entry.id, entry.status) };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientProfile, selectedTicketId, now, t],
  );
  const similarTickets: SourceItem[] = similar.map((row) => {
    const known = useTriageStore.getState().tickets.find((entry) => entry.id === row.ticket_id);
    return {
      id: row.ticket_id,
      kind: "similar" as const,
      code: known?.ticket_number ? `KAI-${known.ticket_number}` : undefined,
      title: row.subject ?? "—",
      meta: t("clientPanel.sameIssue"),
      onOpen: () => void open(row.ticket_id, known?.status ?? null),
    };
  });

  const plan = clientProfile && clientProfile.clientType !== "unknown" ? clientProfile.clientType.charAt(0).toUpperCase() + clientProfile.clientType.slice(1) : null;

  return (
    <ClientPanel
      name={clientProfile?.name ?? clientProfile?.email ?? ticket?.from_name ?? ticket?.from_email ?? t("clientProfile.unknown")}
      email={clientProfile?.email ?? ticket?.from_email}
      draft={clientProfile?.source === "draft"}
      loading={loading}
      account={clientProfile ? {
        plan,
        since: clientProfile.clientSince ? new Date(clientProfile.clientSince).toLocaleDateString(dateLocale, { month: "short", year: "numeric" }) : null,
        tickets: { value: clientProfile.totalTickets, onOpen: () => setView("clients") },
      } : null}
      otherTickets={otherTickets}
      similarTickets={similarTickets}
      labels={{
        draftBadge: t("clientPanel.draftBadge"),
        draftNotice: t("clientPanel.draftNotice"),
        account: t("clientPanel.account"),
        plan: t("clientPanel.plan"),
        mrr: t("clientPanel.mrr"),
        since: t("clientPanel.since"),
        tickets: t("clientPanel.tickets"),
        csat: t("clientPanel.csat"),
        nps: t("clientPanel.nps"),
        otherTickets: t("clientPanel.otherTickets"),
        similarTickets: t("clientPanel.similarTickets"),
        unavailable: t("clientPanel.unavailable"),
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Escalate tab
// ---------------------------------------------------------------------------

const PRIORITY_TONE: Record<string, SignalTone> = { P1: "P1", P2: "P2", P3: "P3" };

function confidenceTone(value: number | null | undefined): SignalTone {
  if (typeof value !== "number") return "none";
  return value > 0.9 ? "ok" : value >= 0.7 ? "warn" : "bad";
}

export function EscalateTabContainer({ ticket, readOnly }: { ticket: Ticket; readOnly: boolean }) {
  const { t } = useTranslation("dashboard");
  const slaConfig = useTriageStore((s) => s.operationalSlaConfig);
  const setPendingEscalation = useTriageStore((s) => s.setPendingEscalation);
  const updateClassification = useTriageStore((s) => s.updateClassification);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sla = computeTicketOperationalSla(ticket, slaConfig);
  const display = sla && !ticket.first_response_at ? slaDisplay(sla) : null;
  const slaValue = display
    ? t(`escalatePanel.sla.${display.status}`, { time: display.status === "overdue" ? formatCompactDuration(display.seconds) : display.status === "onTime" ? formatDuration(display.seconds) : formatCompactDuration(display.seconds) })
    : "—";
  const slaTone: SignalTone = display ? (display.status === "overdue" ? "overdue" : display.status) : "none";
  const frustrated = ticket.sentiment === "frustrated" || ticket.sentiment === "aggressive";
  const confidence = ticket.classification_confidence;

  const signals: EscalateSignal[] = [
    { id: "priority", label: t("escalatePanel.priority"), value: ticket.priority ?? "—", tone: PRIORITY_TONE[ticket.priority ?? ""] ?? "none" },
    { id: "sla", label: t("escalatePanel.slaLabel"), value: slaValue, tone: slaTone },
    { id: "sentiment", label: t("escalatePanel.sentimentLabel"), value: ticket.sentiment ? t(`escalatePanel.sentiment.${ticket.sentiment}`, { defaultValue: ticket.sentiment }) : "—", tone: frustrated ? "frustrated" : "none" },
    { id: "confidence", label: t("escalatePanel.confidenceLabel"), value: typeof confidence === "number" ? confidence.toFixed(2) : "—", tone: confidenceTone(confidence) },
  ];

  const headline = [
    ticket.priority,
    display && display.status !== "onTime" ? slaValue : null,
    frustrated ? t(`escalatePanel.sentiment.${ticket.sentiment}`, { defaultValue: ticket.sentiment ?? "" }) : null,
  ].filter(Boolean).join(" · ");

  const id = ticket.ticket_number ? `KAI-${ticket.ticket_number}` : "";

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await escalateTicket(ticket.id, reason.trim() || undefined);
      if (!res.ok) {
        setError(t("escalatePanel.error"));
        return;
      }
      const body = await res.json() as { ticket?: Partial<Ticket> };
      updateClassification(ticket.id, body.ticket ?? { status: "escalated" });
      setPendingEscalation(ticket.id);
    } catch {
      setError(t("escalatePanel.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <EscalatePanel
      summary={{ headline, explanation: t("escalatePanel.explanation") }}
      signals={signals}
      escalatedText={ticket.status === "escalated" ? t("escalatePanel.escalated") : undefined}
      form={readOnly ? undefined : { reason, onReason: setReason, onSubmit: () => void submit(), submitting, error: error ?? undefined }}
      labels={{
        to: "",
        reason: t("escalatePanel.reason"),
        reasonPlaceholder: t("escalatePanel.reasonPlaceholder"),
        submit: t("escalatePanel.submit", { id }),
        note: t("escalatePanel.note"),
        nobody: "",
      }}
    />
  );
}
