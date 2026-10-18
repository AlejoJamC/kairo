import { resolve } from 'node:path';
import { readPrivate, writePrivate } from './private-files';
import { findEvaluationRun, resultsRoot } from './results';
import { loadCorpus } from './corpus';
import type { WorkflowMemory } from './workflow-scenarios';

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('EVAL_REVIEW_FORMAT');
  return value as RecordValue;
}
export interface MemoryProposal {
  id: number; sourcePosition: number; title: string; content: string;
  evidence: string[]; reviewReasons: string[];
  decision: 'pending_review' | 'approved' | 'rejected'; reviewer: string; targetPositions: number[];
}
export function collectMemoryProposals(run: unknown, dataset: string): MemoryProposal[] {
  const rows = record(run)['rows'];
  if (!Array.isArray(rows)) throw new Error('EVAL_REVIEW_SOURCE');
  const proposals: MemoryProposal[] = [];
  for (const item of rows) {
    const row = record(item), source = record(row['case']);
    if (source['dataset'] !== dataset || row['status'] !== 'completed') continue;
    const position = source['id'];
    if (typeof position !== 'number' || !Number.isSafeInteger(position) || position < 1) throw new Error('EVAL_REVIEW_SOURCE');
    const tables = record(record(row['output'])['tables']);
    for (const table of ['operational_learning','kb_articles']) {
      const entries = tables[table];
      if (!Array.isArray(entries)) continue;
      for (const raw of entries) {
        const entry = record(raw);
        if (table === 'operational_learning' && entry['status'] !== 'pending_review') continue;
        if (table === 'kb_articles' && entry['is_published'] !== false) continue;
        const evidence = table === 'operational_learning' ? record(entry['evidence']) : {};
        const content = table === 'operational_learning' ? entry['summary'] : entry['content'];
        if (typeof content !== 'string' || !content.trim()) continue;
        const strings = (value: unknown) => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
        proposals.push({id:proposals.length+1,sourcePosition:position,
          title:String(evidence['title'] ?? entry['title'] ?? ''),content,
          evidence:strings(evidence['quotes']),reviewReasons:strings(evidence['reasons']),
          decision:'pending_review',reviewer:'',targetPositions:[]});
      }
    }
  }
  return proposals;
}
export function reviewedMemory(original: MemoryProposal[], edited: MemoryProposal[], positions: number[]): WorkflowMemory {
  if (edited.length !== original.length || new Set(edited.map(row=>row.id)).size !== edited.length) throw new Error('EVAL_REVIEW_FORMAT');
  const cases = new Map<number, WorkflowMemory['cases'][number]>();
  for (const row of edited) {
    const source = original.find(item=>item.id===row.id);
    if (!source || row.content !== source.content || row.sourcePosition !== source.sourcePosition ||
      !['pending_review','approved','rejected'].includes(row.decision)) throw new Error('EVAL_REVIEW_SOURCE_CHANGED');
    if (row.decision !== 'approved') continue;
    if (typeof row.reviewer !== 'string' || !row.reviewer.trim() || !Array.isArray(row.targetPositions) || !row.targetPositions.length ||
      row.targetPositions.some(position=>!positions.includes(position))) throw new Error('EVAL_REVIEW_APPROVAL_INCOMPLETE');
    for (const position of new Set(row.targetPositions)) {
      const target = cases.get(position) ?? {position,knowledge:[]};
      target.knowledge.push({content:source.content,status:'approved'});cases.set(position,target);
    }
  }
  if (!cases.size) throw new Error('EVAL_REVIEW_NO_APPROVALS');
  return {cases:[...cases.values()]};
}
export async function enrichmentMemoryCommand(args: string[]) {
  const [command,dataset,mode,selector] = args;
  if (!['main','coverage'].includes(dataset ?? '')) throw new Error('EVAL_ARGUMENTS');
  const selected = dataset as 'main' | 'coverage';
  const path = resolve(resultsRoot,'enrichment',selected,'memory-review.json');
  if (command === 'prepare') {
    if (mode !== 'incoming' || !selector || args.length !== 4) throw new Error('EVAL_ARGUMENTS');
    try { await readPrivate(path); throw new Error('EVAL_REVIEW_ALREADY_EXISTS'); }
    catch(error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const run = await findEvaluationRun('incoming',selected,selector);
    const proposals = collectMemoryProposals(JSON.parse(await readPrivate(resolve(run.directory,'run.json'))),selected);
    if (!proposals.length) throw new Error('EVAL_REVIEW_NO_PROPOSALS');
    await writePrivate(path,{sourceMode:'incoming',sourceRun:run.name,proposals});
    return {dataset:selected,proposals:proposals.length,approved:0,reviewFile:path,requests:0};
  }
  if (command !== 'apply-review' || args.length !== 2) throw new Error('EVAL_ARGUMENTS');
  const review = record(JSON.parse(await readPrivate(path)));
  if (review['sourceMode'] !== 'incoming' || typeof review['sourceRun'] !== 'string' || !Array.isArray(review['proposals'])) throw new Error('EVAL_REVIEW_FORMAT');
  const run = await findEvaluationRun('incoming',selected,review['sourceRun']);
  const original = collectMemoryProposals(JSON.parse(await readPrivate(resolve(run.directory,'run.json'))),selected);
  const memory = reviewedMemory(original,review['proposals'] as MemoryProposal[],(await loadCorpus(selected)).map(row=>row.id));
  await writePrivate(resolve(resultsRoot,'enrichment',selected,'approved-memory.json'),{
    ...memory,review:{sourceRun:run.name,approvals:review['proposals'].filter(value=>record(value)['decision']==='approved')},
  });
  return {dataset:selected,cases:memory.cases.length,approved:memory.cases.reduce((sum,row)=>sum+row.knowledge.length,0),requests:0};
}
