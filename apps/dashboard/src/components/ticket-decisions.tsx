import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { reviewDecision, markTicketViewed, getTicketDecisions } from '@kairo/client-core/endpoints';
import { getPlatform } from '@kairo/client-core/config';

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
        if (active) { setDecisions(data.decisions); setFailed(false); }
      } catch { if (active) setFailed(true); } finally { loading = false; }
    };
    void load();
    const unsubscribeFocus = getPlatform().appFocus.subscribe((visible) => { if (visible) void load(); });
    return () => { active = false; unsubscribeFocus(); };
  }, [ticketId, refresh]);
  const label = (value: string) => t(`decisionWorkflow.values.${value}`, { defaultValue: t('decisionWorkflow.unavailable') });
  return <details style={{ border: '1px solid var(--k-border)', borderRadius: 6, padding: 10 }}>
    <summary>{t('decisionWorkflow.title')}</summary>
    {failed && <p role="alert">{t('decisionWorkflow.error')}</p>}
    {!failed && !decisions.length && <p>{t('decisionWorkflow.empty')}</p>}
    {decisions.map(decision => <section key={decision.id} style={{ marginTop: 12 }}>
      {decision.contract === 'knowledge_impact' && decision.status === 'pending_human_review' && !reviewed.has(decision.id) && <div>
        <button disabled={reviewing !== null} onClick={() => void review(decision.id,true)}>{t('decisionWorkflow.accept')}</button>
        <button disabled={reviewing !== null} onClick={() => void review(decision.id,false)}>{t('decisionWorkflow.reject')}</button>
      </div>}
      <strong>{label(decision.contract)} · {label(decision.status)}</strong>
      <div><time>{new Date(decision.created_at).toLocaleString()}</time></div>
      {decision.result.verdict?.reasoning && <p>{decision.result.verdict.reasoning}</p>}
      <dl>{Object.entries(decision.result.judgments ?? decision.result.verdict?.workflow?.judgments ?? {}).map(([key,value]) =>
        <div key={key}><dt>{label(key)}</dt><dd>{label(value)}</dd></div>)}</dl>
      {decision.result.analysis?.observations.map((observation,index) => <div key={index}>
        <strong>{label(observation.dimension)} · {label(observation.status)}</strong><p>{observation.statement}</p>
        {observation.citations.map((citation,i) => <blockquote key={i}>{citation.quote}<footer>{citation.sourceId}</footer></blockquote>)}
      </div>)}
      {!!decision.result.analysis?.missing.length && <p>{t('decisionWorkflow.missing')}: {decision.result.analysis.missing.map(value => value.startsWith('unsupported_') ? t('decisionWorkflow.unsupported', { dimension: label(value.slice(12)) }) : value).join('; ')}</p>}
      {decision.result.analysis?.waitingOn && <p>{t('decisionWorkflow.waitingOn')}: {decision.result.analysis.waitingOn} — {decision.result.analysis.resumeWhen}</p>}
      {decision.result.classificationProposal && Object.keys(decision.result.classificationProposal).length > 0 && <p>{t('decisionWorkflow.classificationProposal')}: {[decision.result.classificationProposal.priority,decision.result.classificationProposal.urgency].filter((value):value is string => !!value).map(value => value.startsWith('P') ? value : label(value)).join(' · ')}</p>}
      {decision.result.nextAction && <p>{t('decisionWorkflow.nextAction')}: {label(decision.result.nextAction)}</p>}
      {decision.result.execution && <p>{label(decision.result.execution)}</p>}
      {decision.result.contribution && <p>{t('decisionWorkflow.contribution')}: {label(decision.result.contribution)}</p>}
      {decision.result.suggestion && <p>{decision.result.suggestion}</p>}
      {decision.result.attention && <p>{t('decisionWorkflow.attention')}: {label(decision.result.attention)}</p>}
      {decision.result.sla && <p>{t('decisionWorkflow.due')}: {new Date(decision.result.sla.dueAt).toLocaleString()}</p>}
      {decision.result.authorization && <p>{label(decision.result.authorization)}</p>}
      {missingEvidence(decision.result).length > 0 && <p>{t('decisionWorkflow.missing')}: {missingEvidence(decision.result).map(label).join(', ')}</p>}
      {!!decision.result.sources?.length && <details><summary>{t('decisionWorkflow.sources')}</summary>
        {decision.result.sources.map(source => <blockquote key={source.version}>{source.content}<footer>{t('decisionWorkflow.version')}: {source.version}</footer></blockquote>)}
      </details>}
    </section>)}
  </details>;
}
