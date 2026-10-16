import { choice, noul, score, type Questions } from '@typesafe-ai/sdk';
import { z } from 'zod';
import { createDecisionProvider } from '../config/providers';
import type { DecisionProvider } from '../providers/decision';
import { runDecisionFeature } from './run-decision-feature';
import type { LlmCallLogger } from './run-llm-feature';

const QuestionId = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/);
const Instructions = z.string().min(1).max(1000);
const Description = z.string().min(1).max(500);

/** One typed judgment an agent may ask: Choice between options, Score along ordered levels, or Noul for a yes/no condition. */
export const JudgmentQuestionSchema = z.discriminatedUnion('type', [
  z.object({ id: QuestionId, type: z.literal('choice'), instructions: Instructions,
    options: z.record(QuestionId, Description).refine((options) => {
      const count = Object.keys(options).length;
      return count >= 2 && count <= 10;
    }, 'A choice needs between 2 and 10 options') }).strict(),
  z.object({ id: QuestionId, type: z.literal('score'), instructions: Instructions,
    levels: z.array(Description).min(2).max(10) }).strict(),
  z.object({ id: QuestionId, type: z.literal('noul'), instructions: Instructions }).strict(),
]);

export const JudgmentRequestSchema = z.object({
  state: z.record(z.string(), z.unknown()),
  questions: z.array(JudgmentQuestionSchema).min(1).max(8)
    .refine((questions) => new Set(questions.map((question) => question.id)).size === questions.length, 'Question ids must be unique'),
}).strict();
export type JudgmentRequest = z.infer<typeof JudgmentRequestSchema>;

/** Typed judgments on the decision model, logged like every other decision call. */
export async function askJudgments(request: JudgmentRequest, options: {
  feature: string;
  context?: { ticketId?: string; accountId?: string; userId?: string };
  logger?: LlmCallLogger;
  provider?: DecisionProvider;
}) {
  const parsed = JudgmentRequestSchema.parse(request);
  const questions: Questions = Object.fromEntries(parsed.questions.map((question) => [question.id,
    question.type === 'choice' ? choice(question.instructions, question.options)
      : question.type === 'score' ? score(question.instructions, question.levels as [string, string, ...string[]])
        : noul(question.instructions)]));
  const result = await runDecisionFeature<Record<string, unknown>>({
    feature: options.feature,
    provider: options.provider ?? createDecisionProvider('gateway', 'knowledge_decision'),
    state: parsed.state, questions, context: options.context, logger: options.logger,
    versions: { state: 'agent', questions: 'agent' },
  });
  return { answers: result.data.value, model: result.data.modelVersion, llmCallId: result.llmCallId };
}
