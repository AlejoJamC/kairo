import { workflowCli } from './workflow-eval';
import { selectEnrichmentCandidates } from './enrichment-candidates';
import { enrichmentMemoryCommand } from './enrichment-memory';
if (import.meta.main) {
  const args = process.argv.slice(2);
  if (['prepare','apply-review','select-candidates'].includes(args[0] ?? '')) {
    try { console.log(JSON.stringify(args[0] === 'select-candidates' ? await selectEnrichmentCandidates(args[1] ?? 'main') : await enrichmentMemoryCommand(args), null, 2)); }
    catch (error) {
      const code = error instanceof Error && /^EVAL_[A-Z_0-9]+$/.test(error.message) ? error.message : 'EVAL_MEMORY_PREPARATION_FAILED';
      console.error(code);process.exitCode=1;
    }
  } else await workflowCli('enrichment');
}
