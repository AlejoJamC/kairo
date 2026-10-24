export interface RetrievalJudgment {
  id: string;
  cluster: string;
  eligible: string[];
  grades: Record<string, number>;
}
export interface RankedObservation {
  judgment: RetrievalJudgment;
  status: 'ok' | 'partial' | 'unavailable';
  returned: string[];
  limit: number;
  latencyMs: number;
}
export function scoreRetrieval(row: RankedObservation) {
  const { eligible, grades } = row.judgment;
  if (!Number.isInteger(row.limit) || row.limit < 1 || row.returned.length > row.limit ||
    new Set(eligible).size !== eligible.length || new Set(row.returned).size !== row.returned.length ||
    Object.entries(grades).some(([key, grade]) => !eligible.includes(key) || ![0,1,2].includes(grade))) {
    throw new Error('Invalid retrieval judgments or duplicate ranked results');
  }
  const complete = eligible.every(key => key in grades);
  const judgedReturned = row.returned.filter(key => key in grades).length;
  const relevant = eligible.filter(key => (grades[key] ?? 0) > 0).length;
  const hits = row.returned.filter(key => (grades[key] ?? 0) > 0).length;
  const healthy = row.status === 'ok';
  const fullyJudged = judgedReturned === row.returned.length;
  const rank = row.returned.findIndex(key => (grades[key] ?? 0) > 0);
  const dcg = (values: number[]) => values.reduce((sum, grade, i) => sum + (2 ** grade - 1) / Math.log2(i + 2), 0);
  const ideal = dcg(Object.values(grades).sort((a,b) => b-a).slice(0, row.limit));
  return {
    labelCoverage: eligible.length ? Object.keys(grades).length / eligible.length : null,
    returnedLabelCoverage: row.returned.length ? judgedReturned / row.returned.length : null,
    relevant, complete,
    precision: healthy && fullyJudged && row.returned.length ? hits / row.returned.length : null,
    recall: healthy && complete && relevant ? hits / relevant : null,
    reciprocalRank: healthy && complete && relevant && fullyJudged ? rank < 0 ? 0 : 1 / (rank+1) : null,
    ndcg: healthy && complete && relevant && fullyJudged ? ideal ? dcg(row.returned.map(key => grades[key]!)) / ideal : 0 : null,
    noAnswerCorrect: healthy && complete && !relevant ? Number(row.returned.length === 0) : null,
  };
}

const metricNames = ['precision','recall','reciprocalRank','ndcg','noAnswerCorrect'] as const;
type MetricName = typeof metricNames[number];
export function mean(values: number[]) { return values.length ? values.reduce((a,b) => a+b,0) / values.length : null; }
function interval(rows: Array<{ cluster: string; value: number }>, seed: number) {
  const groups = [...new Set(rows.map(row => row.cluster))].map(cluster => rows.filter(row => row.cluster === cluster).map(row => row.value));
  if (groups.length < 2) return null;
  let state = seed >>> 0;
  const samples = Array.from({ length: 2000 }, () => mean(Array.from({ length: groups.length }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return groups[Math.floor(state / 0x100000000 * groups.length)]!;
  }).flat())!).sort((a,b) => a-b);
  return { lower: samples[49]!, upper: samples[1949]!, level: 0.95,
    method: 'query-cluster bootstrap percentile', resamples: samples.length, seed };
}
export function summarizeRetrieval(rows: RankedObservation[], seed: number) {
  const scored = rows.map(row => ({ row, score: scoreRetrieval(row) }));
  const latencies = rows.map(row => row.latencyMs).sort((a,b) => a-b);
  return {
    queries: rows.length,
    available: rows.filter(row => row.status === 'ok').length,
    partial: rows.filter(row => row.status === 'partial').length,
    unavailable: rows.filter(row => row.status === 'unavailable').length,
    successfulEmpty: rows.filter(row => row.status === 'ok' && row.returned.length === 0).length,
    fullyLabeled: scored.filter(row => row.score.complete).length,
    labels: { judgedPairs: rows.reduce((sum,row) => sum + Object.keys(row.judgment.grades).length,0),
      eligiblePairs: rows.reduce((sum,row) => sum + row.judgment.eligible.length,0),
      unjudgedReturned: rows.reduce((sum,row) => sum + row.returned.filter(id => !(id in row.judgment.grades)).length,0) },
    metrics: Object.fromEntries(metricNames.map(metric => {
      const values = scored.flatMap(({ row, score }) => score[metric] === null ? [] : [{ cluster: row.judgment.cluster, value: score[metric] }]);
      return [metric, { score: mean(values.map(row => row.value)), count: values.length,
        clusters: new Set(values.map(row => row.cluster)).size, interval: interval(values, seed) }];
    })) as Record<MetricName, { score: number | null; count: number; clusters: number; interval: ReturnType<typeof interval> }>,
    latencyMs: { median: latencies.length ? latencies[Math.floor((latencies.length-1)*0.5)]! : null,
      p95: latencies.length ? latencies[Math.ceil(latencies.length*0.95)-1]! : null },
  };
}

export function compareRetrieval(baseline: RankedObservation[], candidate: RankedObservation[], seed: number) {
  if (new Set(baseline.map(row => row.judgment.id)).size !== baseline.length ||
    new Set(candidate.map(row => row.judgment.id)).size !== candidate.length) throw new Error('Duplicate comparison cases');
  return Object.fromEntries(metricNames.map(metric => {
    const pairs = baseline.flatMap(left => {
      const right = candidate.find(row => row.judgment.id === left.judgment.id);
      if (!right) return [];
      if (JSON.stringify(left.judgment) !== JSON.stringify(right.judgment)) throw new Error('Comparison judgments differ');
      const a = scoreRetrieval(left)[metric], b = scoreRetrieval(right)[metric];
      return a === null || b === null ? [] : [{ cluster: left.judgment.cluster, value: b-a }];
    });
    return [metric, { pairedQueries: pairs.length, delta: mean(pairs.map(row => row.value)), interval: interval(pairs, seed) }];
  }));
}

export function retrievalRecommendation(input: { synthetic: boolean; safetyPassed: boolean; summaries: ReturnType<typeof summarizeRetrieval>[] }) {
  const reliable = input.safetyPassed && input.summaries.length > 0 && input.summaries.every(row =>
    row.queries > 0 && row.available === row.queries && row.fullyLabeled === row.queries);
  return { action: 'retain_current_profiles' as const, automaticChanges: false,
    reason: !reliable ? 'incomplete_labels_or_technical_guarantees' : input.synthetic ? 'synthetic_evidence_does_not_establish_business_relevance' : 'human_review_required',
    evidenceUsable: reliable };
}
