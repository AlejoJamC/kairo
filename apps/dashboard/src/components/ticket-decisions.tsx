import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reviewDecision, markTicketViewed, getTicketDecisions } from '@kairo/client-core/endpoints';
import { getPlatform } from '@kairo/client-core/config';
import { Button, EvidencePanel, type EvidenceRow } from "@kairo/ui";

interface Decision {
  id: string; contract: string; status: string; created_at: string; message_id: string | null;
  result: { classificationProposal?: { priority?: string; urgency?: string }; reviewOf?: string; judgments?: Record<string,string>; attention?: string; missing?: string[];
    nextAction?: string; assignedTo?: string; authorization?: string; contribution?: string; suggestion?: string; execution?: string;
    analysis?: { observations: { dimension: string; statement: string; status: string; citations: { sourceId:string; quote:string }[] }[]; missing: string[]; waitingOn: string | null; resumeWhen: string | null };
    sources?: { id: string; version: string; content: string }[];
    evidence?: { missing?: string[] }; sla?: { dueAt: string; status: string };
    verdict?: { workflow?: { judgments: Record<string,string> }; reasoning?: string;
      evidence?: { missing: string[]; truncated: boolean };
      decision?: { evidence?: { missing: string[]; truncated: boolean } } } };
}
function missingEvidence(result: Decision['result']): string[] {
  const evidence = result.verdict?.evidence ?? result.verdict?.decision?.evidence;
  return [...new Set([...(result.missing ?? []), ...(result.evidence?.missing ?? []),
    ...(evidence?.missing ?? []), ...(evidence?.truncated ? ['truncated_body'] : [])])];
}
export function TicketDecisions({ ticketId }: { ticketId: string }) {
  const { t } = useTranslation('dashboard');
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [failed, setFailed] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const viewedTicket = useRef<string | null>(null);
  const reviewed = new Set(decisions.flatMap(row => row.result.reviewOf ? [row.result.reviewOf] : []));
  async function review(id: string, accept: boolean) {
    setReviewing(id);
    try {
      const response = await reviewDecision(ticketId, id, accept);
      if (!response.ok) throw new Error('Review failed');
      setRefresh(value => value+1);
    } catch { setFailed(true); } finally { setReviewing(null); }
  }
  useEffect(() => {
    let active = true;
    let loading = false;
    setDecisions([]);
    setLoaded(false);
    const load = async () => {
      if (loading) return;
      loading = true;
      try {
        if (viewedTicket.current !== ticketId) {
          const viewed = await markTicketViewed(ticketId);
          if (!viewed.ok) throw new Error('View persistence failed');
          if (!active) return;
          viewedTicket.current = ticketId;
        }
        const response = await getTicketDecisions(ticketId);
        if (!response.ok) throw new Error('Decision retrieval failed');
        const data = await response.json() as { decisions: Decision[] };
        if (active) { setDecisions(data.decisions); setFailed(false); setLoaded(true); }
      } catch { if (active) { setFailed(true); setLoaded(true); } } finally { loading = false; }
    };
    void load();
    const unsubscribeFocus = getPlatform().appFocus.subscribe((visible) => { if (visible) void load(); });
    return () => { active = false; unsubscribeFocus(); };
  }, [ticketId, refresh]);
  const label = (value: string) => t(`decisionWorkflow.values.${value}`, { defaultValue: t('decisionWorkflow.unavailable') });
  const rows: EvidenceRow[] = decisions.flatMap((decision) => {
    const result = decision.result;
    const pending = decision.contract === 'knowledge_impact' && decision.status === 'pending_human_review' && !reviewed.has(decision.id);
    const head: EvidenceRow = {
      id: `${decision.id}:head`,
      key: label(decision.contract),
      value: label(decision.status),
      sub: new Date(decision.created_at).toLocaleString(),
      actions: pending ? <>
        <Button size="sm" variant="primary" disabled={reviewing !== null} onPress={() => void review(decision.id, true)}>{t('decisionWorkflow.accept')}</Button>
        <Button size="sm" disabled={reviewing !== null} onPress={() => void review(decision.id, false)}>{t('decisionWorkflow.reject')}</Button>
      </> : undefined,
    };
    const typed: EvidenceRow[] = [];
    const row = (key: string, value: string, sub?: string) => typed.push({ id: `${decision.id}:${typed.length}`, key, value, ...(sub ? { sub } : {}) });
    for (const [key, value] of Object.entries(result.judgments ?? result.verdict?.workflow?.judgments ?? {})) row(label(key), label(value));
    for (const observation of result.analysis?.observations ?? []) {
      row(label(observation.dimension), label(observation.status), observation.citations.map((citation) => `“${citation.quote}” · ${citation.sourceId}`).join(' · ') || undefined);
    }
    const gaps = result.analysis?.missing ?? [];
    if (gaps.length) row(t('decisionWorkflow.missing'), gaps.map((value) => value.startsWith('unsupported_') ? t('decisionWorkflow.unsupported', { dimension: label(value.slice(12)) }) : value).join('; '));
    if (result.analysis?.waitingOn) row(t('decisionWorkflow.waitingOn'), result.analysis.waitingOn, result.analysis.resumeWhen ?? undefined);
    const proposal = result.classificationProposal;
    if (proposal && Object.keys(proposal).length > 0) {
      row(t('decisionWorkflow.classificationProposal'), [proposal.priority, proposal.urgency].filter((value): value is string => !!value).map((value) => value.startsWith('P') ? value : label(value)).join(' · '));
    }
    if (result.nextAction) row(t('decisionWorkflow.nextAction'), label(result.nextAction));
    if (result.execution) row(t('decisionWorkflow.executionLabel'), label(result.execution));
    if (result.contribution) row(t('decisionWorkflow.contribution'), label(result.contribution));
    if (result.attention) row(t('decisionWorkflow.attention'), label(result.attention));
    if (result.sla) row(t('decisionWorkflow.due'), new Date(result.sla.dueAt).toLocaleString());
    if (result.authorization) row(t('decisionWorkflow.authorizationLabel'), label(result.authorization));
    const missing = missingEvidence(result);
    if (missing.length) row(t('decisionWorkflow.missing'), missing.map(label).join(', '));
    for (const source of result.sources ?? []) row(t('decisionWorkflow.sources'), `${t('decisionWorkflow.version')}: ${source.version}`, source.content);
    return [head, ...typed];
  });

  return (
    <EvidencePanel
      title={t('decisionWorkflow.title')}
      summary={loaded && !failed && !decisions.length ? t('decisionWorkflow.empty') : undefined}
      confidenceLabel={t('decisionWorkflow.title')}
      rows={rows}
      expanded={expanded || failed}
      onToggle={() => setExpanded((value) => !value)}
      loading={!loaded}
      error={failed ? { message: t('decisionWorkflow.error'), retryLabel: t('decisionWorkflow.retry'), onRetry: () => setRefresh((value) => value + 1) } : undefined}
      footer={{ engine: t('decisionWorkflow.engine'), note: t('decisionWorkflow.note') }}
    />
  );
}
