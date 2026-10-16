import { Output, ToolLoopAgent, isStepCount, tool, wrapLanguageModel, type LanguageModelMiddleware, type ToolSet } from 'ai';
import { z } from 'zod';
import { resolveModelRoute, type ModelRole } from '../config/model-roles';
import type { PromptLang } from '../classification/prompt';
import { GatewayClient, gatewayError, gatewayKey, gatewayProvenance, gatewayProviderOptions, warnIfSystemCredential } from '../providers/gateway/client';
import { ProviderError } from '../providers/base';
import { withGeneration, usageDetails } from './generation';
import { extractPromptVersion, loadPromptTemplate } from './template';
import type { LlmCallLogger, LlmCallRecord } from './run-llm-feature';

export const OperationResultSchema = z.object({
  status: z.enum(['completed', 'proposed', 'failed']),
  authorization: z.enum(['read', 'human_review', 'denied']),
  data: z.record(z.string(), z.unknown()),
  missing: z.array(z.string()),
  needsReview: z.boolean(),
});
export type OperationResult = z.infer<typeof OperationResultSchema>;

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  execute: (input: unknown) => Promise<OperationResult>;
}

/**
 * What one workflow block may do: its instructions, the tools it may call, its
 * budgets and its typed answer. Account identity and permissions live in the
 * tool closures, never in the model's hands.
 */
export interface AgentContract<OUTPUT = never> {
  /** snake_case: the `llm_calls.feature` value and the Langfuse generation name. */
  feature: string;
  /** Directory under `packages/intelligence/prompts/` holding the block's instructions. */
  promptId: string;
  modelRole: ModelRole;
  /** The only tools this block may receive. */
  tools: readonly string[];
  maxSteps: number;
  maxOutputTokens: number;
  /** Omitted: the provider's default reasoning. */
  reasoning?: 'none' | 'low' | 'medium' | 'high';
  /** Typed final answer; without it the block answers in text. */
  output?: z.ZodType<OUTPUT>;
  /** The first step must call a tool, so no answer is produced before the case is read. */
  readFirst?: boolean;
}

/**
 * Runs one unit of work exactly once per id. Inline by default; inside an
 * Inngest function it is `step.run`, so every model call and tool call of an
 * agent run is memoized and a retried run resumes instead of repeating effects.
 */
export type AgentStepRunner = <T>(id: string, run: () => Promise<T>) => Promise<T>;
export const inlineAgentSteps: AgentStepRunner = (_id, run) => run();

export interface AgentRunRequest {
  lang: PromptLang;
  messages: { role: 'user' | 'assistant'; content: string }[];
  tools: AgentTool[];
  context: { accountId: string; ticketId?: string; userId?: string };
  logger?: LlmCallLogger;
  signal?: AbortSignal;
  steps?: AgentStepRunner;
}

type GenerateResult = Awaited<ReturnType<NonNullable<LanguageModelMiddleware['wrapGenerate']>>>;

/** A memoized result comes back as JSON; restore what the SDK reads as a Date. */
function reviveGenerate(result: GenerateResult): GenerateResult {
  const timestamp = result.response?.timestamp as unknown;
  return typeof timestamp === 'string' && result.response
    ? { ...result, response: { ...result.response, timestamp: new Date(timestamp) } }
    : result;
}

/** One block of the decision workflows as an AI SDK agent with shared tools. */
export async function runAgent<OUTPUT = never>(
  contract: AgentContract<OUTPUT>,
  request: AgentRunRequest,
  deps: { transport?: typeof fetch } = {},
) {
  const outside = request.tools.find((definition) => !contract.tools.includes(definition.name));
  if (outside) throw new ProviderError(`Tool ${outside.name} is outside the ${contract.feature} contract`, false);
  const { model } = resolveModelRoute(contract.modelRole);
  const gateway = new GatewayClient(gatewayKey(), deps.transport);
  const instructions = await loadPromptTemplate(contract.promptId, request.lang);
  const promptVersion = extractPromptVersion(instructions);
  const steps = request.steps ?? inlineAgentSteps;
  const operations: { tool: string; result: OperationResult }[] = [];
  const completed = new Map<string, Promise<OperationResult>>();
  const log = async (record: LlmCallRecord) => {
    try { await request.logger?.(record); } catch { console.warn('[agent] Call logging unavailable'); }
  };

  const tools: ToolSet = Object.fromEntries(request.tools.map((definition) => [definition.name, tool({
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: OperationResultSchema,
    execute: async (input: unknown, { toolCallId }: { toolCallId: string }) => {
      const parsed = definition.inputSchema.parse(input);
      const key = JSON.stringify([definition.name, parsed]);
      let pending = completed.get(key);
      if (!pending) {
        pending = steps(`${contract.feature}:tool:${definition.name}:${toolCallId}`, async (): Promise<OperationResult> => {
          try { return OperationResultSchema.parse(await definition.execute(parsed)); }
          catch { return { status: 'failed', authorization: 'denied', data: {}, missing: ['tool_unavailable'], needsReview: true }; }
        });
        completed.set(key, pending);
      }
      const result = await pending;
      operations.push({ tool: definition.name, result });
      return result;
    },
  })]));

  let modelCalls = 0;
  const durable: LanguageModelMiddleware = {
    wrapGenerate: async ({ doGenerate }) => reviveGenerate(
      await steps(`${contract.feature}:model:${modelCalls++}`, async () => doGenerate()),
    ),
  };

  const started = Date.now();
  return withGeneration({
    name: contract.feature, model, input: request.messages,
    metadata: { promptVersion }, context: request.context,
  }, async (generation) => {
    try {
      await gateway.requireModel(model, 'language');
      const agent = new ToolLoopAgent({
        id: contract.feature,
        model: wrapLanguageModel({ model: gateway.sdk.languageModel(model), middleware: durable }),
        providerOptions: gatewayProviderOptions(model),
        instructions,
        tools,
        // Reasoning models reject a named tool_choice (HTTP 400), so a read-first
        // block only requires some tool on its first step. The last step may not
        // call tools, so the run always ends with an answer.
        prepareStep: ({ stepNumber }) => stepNumber === 0 && contract.readFirst
          ? { toolChoice: 'required' }
          : stepNumber === contract.maxSteps - 1 ? { toolChoice: 'none' } : {},
        stopWhen: isStepCount(contract.maxSteps),
        maxOutputTokens: contract.maxOutputTokens,
        ...(contract.reasoning ? { reasoning: contract.reasoning } : {}),
        ...(contract.output ? { output: Output.object({ schema: contract.output }) } : {}),
        maxRetries: 0,
      });
      const result = await agent.generate({
        messages: request.messages,
        abortSignal: request.signal ? AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
      });
      let output: OUTPUT | null = null;
      if (contract.output) {
        try { output = contract.output.parse(result.output); }
        catch { throw new ProviderError(`${contract.feature} returned no typed answer (finish=${result.finishReason}, steps=${result.steps.length})`, false); }
      } else if (!result.text.trim()) {
        throw new ProviderError(result.finishReason === 'length'
          ? `${contract.feature} exceeded its token budget`
          : `${contract.feature} returned no final answer (finish=${result.finishReason}, steps=${result.steps.length})`, false);
      }
      const usage = { promptTokens: result.totalUsage.inputTokens ?? null, completionTokens: result.totalUsage.outputTokens ?? null };
      const provenance = gatewayProvenance(result.providerMetadata, result.response.modelId);
      warnIfSystemCredential(provenance);
      const stepCosts = result.steps.map((step) => gatewayProvenance(step.providerMetadata, step.response.modelId).costUsd);
      provenance.costUsd = stepCosts.every((cost) => cost !== null)
        ? stepCosts.reduce<number>((total, cost) => total + (cost ?? 0), 0) : null;
      const responseText = contract.output ? JSON.stringify(output) : result.text;
      generation.update({ output: responseText, ...usageDetails(usage),
        metadata: { modelRole: contract.modelRole, reportedModel: provenance.model, costUsd: provenance.costUsd } });
      await log({
        feature: contract.feature, provider: 'gateway', model: provenance.model,
        promptVersion, promptText: instructions, responseText,
        ...usage, confidenceScore: null, latencyMs: Date.now() - started, errorCode: null, errorDetail: null,
        ...request.context,
      });
      return { text: result.text, output, operations, steps: result.steps.length, ...provenance, promptVersion, usage, finishReason: result.finishReason };
    } catch (error) {
      const safe = error instanceof ProviderError ? error : gatewayError(error);
      await log({
        feature: contract.feature, provider: 'gateway', model, promptVersion, promptText: instructions,
        responseText: null, promptTokens: null, completionTokens: null, confidenceScore: null,
        latencyMs: Date.now() - started, errorCode: 'LLM_ERROR', errorDetail: safe.message, ...request.context,
      });
      throw safe;
    }
  });
}
