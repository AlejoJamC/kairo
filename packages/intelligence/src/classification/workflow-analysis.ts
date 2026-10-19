import { z } from 'zod';
import { sourceFragments } from '../knowledge/source-fragments';

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

export const ReferencedWorkflowAnalysisSchema = WorkflowAnalysisSchema.extend({
  observations: z.array(Observation.omit({ citations: true }).extend({
    evidenceIds: z.array(z.string().min(1)).min(1).max(10),
  })).max(20),
});

export function workflowEvidenceFragments(sources: WorkflowSource[]) {
  return sources.flatMap((source, index) => sourceFragments(source.text).map(fragment => ({
    ...fragment, id: `s${index + 1}:${fragment.id}`, sourceId: source.id, authority: source.authority,
  })));
}

export function resolveWorkflowEvidence(
  analysis: z.infer<typeof ReferencedWorkflowAnalysisSchema>, sources: WorkflowSource[],
): WorkflowAnalysis {
  const fragments = new Map(workflowEvidenceFragments(sources).map(fragment => [fragment.id, fragment]));
  const missing = [...analysis.missing];
  const observations: WorkflowAnalysis['observations'] = [];
  for (const { evidenceIds, ...observation } of analysis.observations) {
    if (evidenceIds.some(id => !fragments.has(id))) {
      missing.push(`unsupported_${observation.dimension}`);
      continue;
    }
    observations.push({ ...observation, citations: [...new Set(evidenceIds)].map(id => {
      const fragment = fragments.get(id)!;
      return { sourceId: fragment.sourceId, quote: fragment.text };
    }) });
  }
  return groundWorkflowAnalysis({ ...analysis, observations, missing }, sources);
}
