import { z } from 'zod';
import { EmailKnowledgeDraftSchema, type EmailKnowledgeProposal } from './email-knowledge';

export const SOURCE_REFERENCE_VERSION = '1.0.1';
export interface SourceFragment { id: string; text: string; start: number; end: number }

/** Offsets refer to the exact source supplied for this extraction. */
export function sourceFragments(source: string): SourceFragment[] {
  const fragments: SourceFragment[] = [];
  for (const line of source.matchAll(/[^\r\n]+/g)) {
    if (!line[0].trim()) continue;
    for (let offset = 0; offset < line[0].length; offset += 600) {
      const start = line.index + offset;
      const end = start + Math.min(600, line[0].length - offset);
      fragments.push({ id: `e${fragments.length + 1}`, text: source.slice(start, end), start, end });
    }
  }
  return fragments;
}

export const ReferencedKnowledgeDraftSchema = z.object({
  proposals: z.array(EmailKnowledgeDraftSchema.shape.proposals.element.omit({ evidence: true }).extend({
    evidenceIds: z.array(z.string().min(1).max(100)).min(1).max(5),
  })).max(5),
});
export type ReferencedKnowledgeDraft = z.infer<typeof ReferencedKnowledgeDraftSchema>;

export function resolveSourceReferences(draft: ReferencedKnowledgeDraft, fragments: SourceFragment[]) {
  const sources = new Map(fragments.map(fragment => [fragment.id, fragment.text]));
  const proposals: EmailKnowledgeProposal[] = [];
  const blocked: { kind: EmailKnowledgeProposal['kind']; status: 'blocked'; reasons: string[] }[] = [];
  for (const { evidenceIds, ...proposal } of draft.proposals) {
    if (evidenceIds.some(id => !sources.has(id))) {
      blocked.push({ kind: proposal.kind, status: 'blocked', reasons: ['invalid_source_reference'] });
      continue;
    }
    proposals.push({ ...proposal, evidence: [...new Set(evidenceIds)].map(id => sources.get(id)!) });
  }
  return { proposals, blocked };
}
