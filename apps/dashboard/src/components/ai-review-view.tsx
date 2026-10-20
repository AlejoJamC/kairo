import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchProposals } from "@kairo/client-core/queries";
import { approveClassification } from "@kairo/client-core/endpoints";
import { useAuth } from "@kairo/client-core/auth";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { QueueView } from "@/components/queue-view";
import type { AppView } from "@/types";
import type { Ticket } from "@kairo/types";
import { AiProposal, FilterPill, FilterPillGroup } from "@kairo/ui";

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
  const addTicket = useTriageStore((state) => state.addTicket);
  const selectTicket = useTriageStore((state) => state.selectTicket);
  const selectedTicketId = useTriageStore((state) => state.selectedTicketId);

  const [filter, setFilter] = useState<ProposalFilter>("pending");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [counts, setCounts] = useState<Record<ProposalFilter, number | null>>({ pending: null, auto_approved: null });
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<"confirm" | "reject" | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: queryError } = await fetchProposals(filter);
    if (!queryError && data) {
      setProposals(data as unknown as Proposal[]);
      setCounts((prev) => ({ ...prev, [filter]: data.length }));
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, accountId, load]);

  const selected = proposals.find((p) => p.ticket_id === selectedTicketId) ?? null;
  const tickets = proposals.map((proposal) => proposal.ticket);

  const openThread = (ticket: Ticket) => {
    setError(false);
    addTicket(ticket);
    selectTicket(ticket.id);
  };

  const review = async (proposal: Proposal, action: "confirm" | "reject") => {
    setBusyAction(action);
    setError(false);
    try {
      const res = await approveClassification(proposal.ticket_id, { proposal_id: proposal.id, action });
      if (!res.ok) throw new Error(String(res.status));
      const index = proposals.findIndex((p) => p.id === proposal.id);
      const remaining = proposals.filter((p) => p.id !== proposal.id);
      setProposals(remaining);
      setCounts((prev) => ({ ...prev, [filter]: remaining.length }));
      // The queue selects the next proposal once this one is answered.
      const next = remaining[Math.min(index, remaining.length - 1)];
      if (next) openThread(next.ticket);
      else selectTicket(null);
    } catch {
      setError(true);
    } finally {
      setBusyAction(null);
    }
  };

  const strip = selected && filter === "pending" ? (
    <AiProposal
      title={t("aiReviewView.proposalTitle")}
      model={selected.model_version}
      fields={[
        { label: t("aiReviewView.fieldType"), value: selected.proposed_type },
        { label: t("aiReviewView.fieldCategory"), value: selected.proposed_category },
        { label: t("aiReviewView.fieldPriority"), value: selected.proposed_priority },
        { label: t("aiReviewView.fieldTone"), value: selected.proposed_sentiment },
      ]}
      confidence={selected.confidence_score}
      confidenceLabel={t("aiReviewView.fieldConfidence")}
      state={error ? "error" : busyAction === "confirm" ? "confirming" : "ready"}
      onConfirm={() => void review(selected, "confirm")}
      onReject={() => void review(selected, "reject")}
      onRetry={() => setError(false)}
      labels={{ confirm: t("aiReviewView.confirm"), reject: t("aiReviewView.reject"), retry: t("replyBar.retry"), error: t("aiReviewView.error"), confidence: t("aiReviewView.fieldConfidence") }}
    />
  ) : undefined;

  return (
    <QueueView
      title={t("aiReviewView.title")}
      description={t("aiReviewView.subtitle")}
      barVariant="pills"
      bar={
        <FilterPillGroup label={t("aiReviewView.filters")}>
          <FilterPill kind="tab" active={filter === "pending"} count={counts.pending} onPress={() => setFilter("pending")}>
            {t("aiReviewView.tabPending")}
          </FilterPill>
          <FilterPill kind="tab" active={filter === "auto_approved"} count={counts.auto_approved} onPress={() => setFilter("auto_approved")}>
            {t("aiReviewView.tabAutoApproved")}
          </FilterPill>
        </FilterPillGroup>
      }
      tickets={tickets}
      loading={loading}
      empty={filter === "pending"
        ? { title: t("aiReviewView.emptyPending"), description: t("aiReviewView.emptyPendingHint") }
        : { title: t("aiReviewView.emptyAutoApproved"), description: t("aiReviewView.emptyAutoApprovedHint") }}
      onOpen={openThread}
      aboveTicket={strip}
    />
  );
}
