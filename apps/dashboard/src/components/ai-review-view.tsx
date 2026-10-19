import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchProposals } from "@kairo/client-core/queries";
import { approveClassification } from "@kairo/client-core/endpoints";
import { useAuth } from "@kairo/client-core/auth";
import { useTriageStore } from "@kairo/client-core/stores/triage-store";
import { TicketDetail } from "@/components/ticket-detail";
import { AiAssistant } from "@/components/ai-assistant";
import { TicketCard } from "@/components/ticket-card";
import type { AppView } from "@/types";
import type { Ticket } from "@kairo/types";
import { AiProposal, Box, Chip, Spinner, Text } from "@kairo/ui";

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
  const [busyAction, setBusyAction] = useState<"confirm" | "reject" | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: queryError } = await fetchProposals(filter);

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
    setBusyAction(action);
    setError(false);
    try {
      const res = await approveClassification(proposal.ticket_id, { proposal_id: proposal.id, action });
      if (!res.ok) throw new Error(String(res.status));
      setProposals((prev) => prev.filter((p) => p.id !== proposal.id));
      selectTicket(null);
    } catch {
      setError(true);
    } finally {
      setBusyAction(null);
    }
  };

  const showDetailPane = selected !== null;

  const listPane = (
    <Box display="flex" flexDirection="column" overflow="hidden" backgroundColor="var(--k-surface)" width={showDetailPane ? 360 : undefined} minWidth={showDetailPane ? 360 : undefined} flex={showDetailPane ? undefined : 1} borderRightWidth={showDetailPane ? 1 : 0} borderRightColor="var(--k-border)" flexShrink={0} borderStyle="solid">
      <Box borderBottomWidth={1} borderBottomColor="var(--k-border)" backgroundColor="white" paddingVertical={16} paddingHorizontal={24} flexShrink={0} borderStyle="solid">
        <Text tag="h1" fontSize={18} fontWeight={600} color="var(--k-text-primary)" letterSpacing={-0.18} font="display" margin={0} display="block">
          {t("aiReviewView.title")}
        </Text>
        <Text tag="p" marginTop={2} fontSize={13} color="var(--k-text-tertiary)" display="block">
          {t("aiReviewView.subtitle")}
        </Text>
        <Box display="flex" gap={8} marginTop={12}>
          <Chip selected={filter === "pending"} onPress={() => setFilter("pending")}>
            {t("aiReviewView.tabPending")}
          </Chip>
          <Chip selected={filter === "auto_approved"} onPress={() => setFilter("auto_approved")}>
            {t("aiReviewView.tabAutoApproved")}
          </Chip>
        </Box>
      </Box>

      <Box flexGrow={1} flexShrink={1} flexBasis="0%" scroll paddingBottom={8}>
        {loading && (
          <Box display="flex" alignItems="center" justifyContent="center" paddingTop={64}>
            <Spinner size="lg" />
          </Box>
        )}

        {!loading && proposals.length === 0 && (
          <Text tag="div" display="flex" flexDirection="column" alignItems="center" justifyContent="center" paddingTop={80} textAlign="center">
            <Text tag="p" fontSize={13} color="var(--k-text-tertiary)" display="block">
              {t(filter === "pending" ? "aiReviewView.emptyPending" : "aiReviewView.emptyAutoApproved")}
            </Text>
          </Text>
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
      </Box>
    </Box>
  );

  if (!selected) return listPane;

  const fields = [
    { label: t("aiReviewView.fieldType"), value: selected.proposed_type },
    { label: t("aiReviewView.fieldCategory"), value: selected.proposed_category },
    { label: t("aiReviewView.fieldPriority"), value: selected.proposed_priority },
    { label: t("aiReviewView.fieldTone"), value: selected.proposed_sentiment },
  ];

  return (
    <>
      {listPane}
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" flexDirection="column" minWidth={0} overflow="hidden">
        <Box borderBottomWidth={1} borderBottomColor="var(--k-border)" backgroundColor="var(--kairo-color-surface)" paddingVertical={12} paddingHorizontal={24} flexShrink={0} borderStyle="solid">
          <AiProposal
            title={t("aiReviewView.proposalTitle")}
            model={selected.model_version}
            fields={fields}
            confidence={selected.confidence_score}
            confidenceLabel={t("aiReviewView.fieldConfidence")}
            state={busyAction === "confirm" ? "confirming" : "ready"}
            onConfirm={() => void review(selected, "confirm")}
            onReject={() => void review(selected, "reject")}
            labels={{ confirm: t("aiReviewView.confirm"), reject: t("aiReviewView.reject"), retry: t("aiReviewView.confirm"), error: t("aiReviewView.error") }}
          />
          {error && (
            <Text role="alert" tag="p" margin={0} marginTop={8} fontSize={13} color="var(--kairo-color-bad-ink)" display="block">{t("aiReviewView.error")}</Text>
          )}
        </Box>
        <Box flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" overflow="hidden">
          <TicketDetail />
        </Box>
      </Box>
      <AiAssistant customer={selectedTicket?.from_name ?? selectedTicket?.from_email ?? "—"} />
    </>
  );
}
