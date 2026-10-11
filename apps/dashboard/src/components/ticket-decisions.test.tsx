import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TicketDecisions } from './ticket-decisions';
import { apiCall } from '@/lib/api-client';
vi.mock('@/lib/api-client', () => ({ apiCall:vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation:() => ({ t:(key:string) => key }) }));
const decision = { id:'decision',contract:'knowledge_impact',status:'pending_human_review',created_at:'2026-01-01T00:00:00Z',message_id:'message',
  result:{ contribution:'solution',authorization:'human_review',execution:'not_executed',analysis:{ observations:[{ dimension:'solution',statement:'A recovery procedure is available.',status:'supported',citations:[{sourceId:'version',quote:'Use account recovery.'}]}],missing:['The account reference is missing.'],waitingOn:null,resumeWhen:null },sources:[{id:'article',version:'version',content:'Use account recovery.'}] } };
beforeEach(() => { vi.mocked(apiCall).mockReset(); vi.mocked(apiCall).mockImplementation(async url => new Response(url.endsWith('/viewed') ? null : JSON.stringify({decisions:[decision]}),{status:url.endsWith('/viewed') ? 204 : 200})); });
describe('ticket decision evidence', () => {
  it.each(['evidence', 'decision'] as const)('shows initial classification gaps from %s without a knowledge result', async source => {
    const evidence = { missing: ['full_body'], truncated: true };
    const initial = { ...decision, contract: 'onboarding_triage', status: 'pending_knowledge', result: {
      verdict: { reasoning: 'Access help requested.', workflow: { judgments: { priority_evidence: 'unknown' } },
        ...(source === 'evidence' ? { evidence } : { decision: { evidence } }) },
    } };
    vi.mocked(apiCall).mockImplementation(async url => new Response(url.endsWith('/viewed') ? null : JSON.stringify({ decisions: [initial] }), { status: url.endsWith('/viewed') ? 204 : 200 }));
    render(<TicketDecisions ticketId="ticket" />);
    await screen.findByText('Access help requested.');
    expect(screen.getByText(/decisionWorkflow.values.full_body/)).toBeInTheDocument();
    expect(screen.getByText(/decisionWorkflow.values.truncated_body/)).toBeInTheDocument();
    expect(screen.getByText('decisionWorkflow.values.unknown')).toBeInTheDocument();
    expect(screen.queryByText('decisionWorkflow.accept')).not.toBeInTheDocument();
  });
  it('records the human view and distinguishes a proposed contribution from an executed action', async () => {
    render(<TicketDecisions ticketId="ticket" />);
    await screen.findByText('A recovery procedure is available.');
    expect(apiCall).toHaveBeenCalledWith('/api/v1/workflow/tickets/ticket/viewed',{method:'POST'});
    expect(screen.getByText('decisionWorkflow.values.not_executed')).toBeInTheDocument();
    expect(screen.getByText(/The account reference is missing/)).toBeInTheDocument();
    expect(screen.getAllByText('Use account recovery.').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText('decisionWorkflow.accept'));
    await waitFor(() => expect(apiCall).toHaveBeenCalledWith('/api/v1/workflow/tickets/ticket/decisions/decision/review',{method:'POST',body:JSON.stringify({accept:true})}));
  });
  it('surfaces failed view persistence instead of silently claiming protection', async () => {
    vi.mocked(apiCall).mockResolvedValue(new Response(null,{status:503}));
    render(<TicketDecisions ticketId="ticket" />);
    await screen.findByRole('alert');
    expect(apiCall).toHaveBeenCalledTimes(1);
  });
});
