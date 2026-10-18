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
import { Box, Button, Chip, Icon, Spinner, Text } from "@kairo/ui";

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
    setBusy(true);
    setError(false);
    try {
      const res = await approveClassification(proposal.ticket_id, { proposal_id: proposal.id, action });
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

  const fields: [string, string | null][] = [
    [t("aiReviewView.fieldType"), selected.proposed_type],
    [t("aiReviewView.fieldCategory"), selected.proposed_category],
    [t("aiReviewView.fieldPriority"), selected.proposed_priority],
    [t("aiReviewView.fieldTone"), selected.proposed_sentiment],
  ];

  return (
    <>
      {listPane}
      <Box flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" flexDirection="column" minWidth={0} overflow="hidden">
        <Box borderBottomWidth={1} borderBottomColor="var(--k-border)" backgroundColor="white" paddingVertical={12} paddingHorizontal={24} flexShrink={0} borderStyle="solid">
          <Text tag="p" margin={0} fontSize={13} fontWeight={600} color="var(--k-text-primary)" display="block">
            {t("aiReviewView.proposalTitle")}
          </Text>
          <Text tag="div" display="flex" flexWrap="wrap" rowGap={4} columnGap={20} marginTop={6} fontSize={13} color="var(--k-text-secondary)">
            {fields.map(([label, value]) => (
              <span key={label}>
                <Text color="var(--k-text-tertiary)">{label}: </Text>
                {value ?? "—"}
              </span>
            ))}
            <span>
              <Text color="var(--k-text-tertiary)">{t("aiReviewView.fieldConfidence")}: </Text>
              {Math.round(selected.confidence_score * 100)}%
            </span>
            <span>
              <Text color="var(--k-text-tertiary)">{t("aiReviewView.fieldModel")}: </Text>
              {selected.model_version}
            </span>
          </Text>
          <Box display="flex" alignItems="center" gap={8} marginTop={10}>
            <Button variant="primary" disabled={busy} icon={<Icon name="check" size={14} />} onPress={() => void review(selected, "confirm")}>
              {t("aiReviewView.confirm")}
            </Button>
            <Button disabled={busy} icon={<Icon name="x" size={14} />} onPress={() => void review(selected, "reject")}>
              {t("aiReviewView.reject")}
            </Button>
            {error && (
              <Text fontSize={13} color="var(--k-danger, var(--kairo-color-bad-ink))">{t("aiReviewView.error")}</Text>
            )}
          </Box>
        </Box>
        <Box flexGrow={1} flexShrink={1} flexBasis="0%" display="flex" overflow="hidden">
          <TicketDetail />
        </Box>
      </Box>
      <AiAssistant customer={selectedTicket?.from_name ?? selectedTicket?.from_email ?? "—"} />
    </>
  );
}
