import type { AgentStepRunner } from '@kairo/intelligence';

interface InngestStep {
  run: (id: string, fn: () => Promise<unknown>) => Promise<unknown>;
}

/**
 * Memoizes every model call and tool call of an agent run as an Inngest step,
 * so a retried function resumes the run instead of repeating calls or effects.
 * `runKey` keeps step ids unique when one function runs several agents.
 */
export function inngestAgentSteps(step: InngestStep, runKey: string): AgentStepRunner {
  return <T>(id: string, run: () => Promise<T>) => step.run(`${runKey}:${id}`, run) as Promise<T>;
}
