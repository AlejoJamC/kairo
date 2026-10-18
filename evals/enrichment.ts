import { workflowCli } from './workflow-eval';
import { enrichmentMemoryCommand } from './enrichment-memory';
if (import.meta.main) {
  const args = process.argv.slice(2);
  if (['prepare','apply-review'].includes(args[0] ?? '')) {
    try { console.log(JSON.stringify(await enrichmentMemoryCommand(args), null, 2)); }
    catch (error) {
      const code = error instanceof Error && /^EVAL_[A-Z_]+$/.test(error.message) ? error.message : 'EVAL_MEMORY_PREPARATION_FAILED';
      console.error(code);process.exitCode=1;
    }
  } else await workflowCli('enrichment');
}
