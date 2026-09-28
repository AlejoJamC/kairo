import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Clock, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { apiCall } from "@/lib/api-client";
import { useAuth } from "@/contexts/auth-context";
import { useTriageStore } from "@/stores/triage-store";
import { TicketDetail } from "@/components/ticket-detail";
import { AiAssistant } from "@/components/ai-assistant";
import { TicketCard } from "@/components/ticket-card";
import type { AppView } from "@/types";
import type { Ticket } from "@kairo/types";

type ProposalFilter = "pending" | "auto_approved";

interface Proposal {
  id: string;
  ticket_id: string;
  status: string;
  proposed_type: string | null;
  proposed_category: string | null;
  proposed_priority: string | null;
  proposed_sentiment: string | null;
  confidence_score: number;
  model_version: string;
  created_at: string;
  ticket: Ticket;
}

interface AiReviewViewProps {
  onViewChange: (view: AppView) => void;
}

export function AiReviewView({ onViewChange: _onViewChange }: AiReviewViewProps) {
  const { t } = useTranslation("dashboard");
  const { user, accountId } = useAuth();
  const { addTicket, selectTicket, selectedTicketId, tickets: storeTickets } = useTriageStore();

  const [filter, setFilter] = useState<ProposalFilter>("pending");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error: queryError } = await supabase
      .from("ticket_proposals")
      .select(
        "id, ticket_id, status, proposed_type, proposed_category, proposed_priority, proposed_sentiment, confidence_score, model_version, created_at, ticket:tickets!inner(*)",
      )
      .eq("status", filter)
      .order("created_at", { ascending: false });

    if (!queryError && data) setProposals(data as unknown as Proposal[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, accountId, load]);

  const selected = proposals.find((p) => p.ticket_id === selectedTicketId) ?? null;
  const selectedTicket = storeTickets.find((tk) => tk.id === selectedTicketId) ?? null;

  const openThread = (proposal: Proposal) => {
    setError(false);
    addTicket(proposal.ticket);
    selectTicket(proposal.ticket_id);
  };

  const review = async (proposal: Proposal, action: "confirm" | "reject") => {
    setBusy(true);
    setError(false);
    try {
      const res = await apiCall(`/api/v1/tickets/${proposal.ticket_id}/classify-approve`, {
        method: "POST",
        body: JSON.stringify({ proposal_id: proposal.id, action }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setProposals((prev) => prev.filter((p) => p.id !== proposal.id));
      selectTicket(null);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const showDetailPane = selected !== null;

  const tabStyle = (active: boolean) => ({
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 6,
    border: "1px solid var(--k-border)",
    cursor: "pointer",
    background: active ? "var(--k-text-primary)" : "white",
    color: active ? "white" : "var(--k-text-secondary)",
  });

  const listPane = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--k-surface)",
        width: showDetailPane ? 360 : undefined,
        minWidth: showDetailPane ? 360 : undefined,
        flex: showDetailPane ? undefined : 1,
        borderRight: showDetailPane ? "1px solid var(--k-border)" : undefined,
        flexShrink: 0,
      }}
    >
      <div style={{ borderBottom: "1px solid var(--k-border)", background: "white", padding: "16px 24px", flexShrink: 0 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--k-text-primary)", letterSpacing: "-0.01em", fontFamily: "var(--k-font-display)", margin: 0 }}>
          {t("aiReviewView.title")}
        </h1>
        <p style={{ marginTop: 2, fontSize: 13, color: "var(--k-text-tertiary)" }}>
          {t("aiReviewView.subtitle")}
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="button" style={tabStyle(filter === "pending")} onClick={() => setFilter("pending")}>
            {t("aiReviewView.tabPending")}
          </button>
          <button type="button" style={tabStyle(filter === "auto_approved")} onClick={() => setFilter("auto_approved")}>
            {t("aiReviewView.tabAutoApproved")}
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: 64 }}>
            <Clock style={{ width: 20, height: 20, color: "var(--k-text-tertiary)" }} className="animate-spin" />
          </div>
        )}

        {!loading && proposals.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", paddingTop: 80, textAlign: "center" }}>
            <p style={{ fontSize: 13, color: "var(--k-text-tertiary)" }}>
              {t(filter === "pending" ? "aiReviewView.emptyPending" : "aiReviewView.emptyAutoApproved")}
            </p>
          </div>
        )}

        {!loading &&
          proposals.map((proposal) => (
            <TicketCard
              key={proposal.id}
              ticket={proposal.ticket}
              selected={selectedTicketId === proposal.ticket_id}
              onSelect={() => openThread(proposal)}
            />
          ))}
      </div>
    </div>
  );

  if (!selected) return listPane;

  const fields: [string, string | null][] = [
    [t("aiReviewView.fieldType"), selected.proposed_type],
    [t("aiReviewView.fieldCategory"), selected.proposed_category],
    [t("aiReviewView.fieldPriority"), selected.proposed_priority],
    [t("aiReviewView.fieldTone"), selected.proposed_sentiment],
  ];

  const buttonStyle = (primary: boolean) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 500,
    borderRadius: 6,
    cursor: busy ? "not-allowed" : "pointer",
    opacity: busy ? 0.6 : 1,
    border: "1px solid var(--k-border)",
    background: primary ? "var(--k-text-primary)" : "white",
    color: primary ? "white" : "var(--k-text-primary)",
  });

  return (
    <>
      {listPane}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        <div style={{ borderBottom: "1px solid var(--k-border)", background: "white", padding: "12px 24px", flexShrink: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--k-text-primary)" }}>
            {t("aiReviewView.proposalTitle")}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 20px", marginTop: 6, fontSize: 13, color: "var(--k-text-secondary)" }}>
            {fields.map(([label, value]) => (
              <span key={label}>
                <span style={{ color: "var(--k-text-tertiary)" }}>{label}: </span>
                {value ?? "—"}
              </span>
            ))}
            <span>
              <span style={{ color: "var(--k-text-tertiary)" }}>{t("aiReviewView.fieldConfidence")}: </span>
              {Math.round(selected.confidence_score * 100)}%
            </span>
            <span>
              <span style={{ color: "var(--k-text-tertiary)" }}>{t("aiReviewView.fieldModel")}: </span>
              {selected.model_version}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
            <button type="button" disabled={busy} style={buttonStyle(true)} onClick={() => void review(selected, "confirm")}>
              <Check style={{ width: 14, height: 14 }} />
              {t("aiReviewView.confirm")}
            </button>
            <button type="button" disabled={busy} style={buttonStyle(false)} onClick={() => void review(selected, "reject")}>
              <X style={{ width: 14, height: 14 }} />
              {t("aiReviewView.reject")}
            </button>
            {error && (
              <span style={{ fontSize: 13, color: "var(--k-danger, #b42318)" }}>{t("aiReviewView.error")}</span>
            )}
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          <TicketDetail />
        </div>
      </div>
      <AiAssistant customer={selectedTicket?.from_name ?? selectedTicket?.from_email ?? "—"} />
    </>
  );
}
