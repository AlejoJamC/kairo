import { z } from 'zod';

const Citation = z.object({ sourceId: z.string(), quote: z.string().min(1) });
const Observation = z.object({
  dimension: z.enum(['identity','request','impact','alternative','deadline','attempt','outcome','change','pending_request','solution']),
  statement: z.string().min(1), status: z.enum(['reported','supported','contradictory']),
  citations: z.array(Citation).min(1),
});
export const WorkflowAnalysisSchema = z.object({
  observations: z.array(Observation).max(20),
  missing: z.array(z.string()).max(12),
  waitingOn: z.string().nullable(), resumeWhen: z.string().nullable(),
});
export type WorkflowAnalysis = z.infer<typeof WorkflowAnalysisSchema>;
export interface WorkflowSource { id: string; text: string; authority: 'message' | 'approved_knowledge' | 'directory' | 'configuration' }
export function groundWorkflowAnalysis(analysis: WorkflowAnalysis, sources: WorkflowSource[]): WorkflowAnalysis {
  const available = new Map(sources.map(source => [source.id, source]));
  const rejected = analysis.observations.filter(observation => observation.citations.some(citation => !available.get(citation.sourceId)?.text.includes(citation.quote)));
  return { ...analysis,
    observations: analysis.observations.filter(observation => !rejected.includes(observation)).map(observation => ({ ...observation,
      // A matching quotation proves attribution, not the truth of a sender's claim.
      status: observation.status === 'supported' && observation.citations.every(citation => available.get(citation.sourceId)?.authority === 'message') ? 'reported' : observation.status,
    })),
    missing: [...analysis.missing, ...rejected.map(observation => `unsupported_${observation.dimension}`)],
  };
}
export function supportedNextAction(action: string | undefined, analysis: WorkflowAnalysis, assignee: string | null): string {
  if (action === 'wait' && (!assignee || !analysis.waitingOn || !analysis.resumeWhen)) return 'request_information';
  if (action === 'resolve' && !analysis.observations.some(row => row.dimension === 'outcome' && row.status !== 'contradictory')) return 'request_information';
  return action ?? 'unknown';
}
