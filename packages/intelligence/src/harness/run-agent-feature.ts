import { resolveModelRoute } from '../config/model-roles';
import { generateText, isStepCount, tool, type ToolSet } from 'ai';
import { z } from 'zod';
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

export interface AgentFeatureRequest {
  lang: PromptLang;
  messages: { role: 'user' | 'assistant'; content: string }[];
  tools: AgentTool[];
  context: { accountId: string; ticketId: string; userId: string };
  logger?: LlmCallLogger;
  signal?: AbortSignal;
}

/** A bounded tool loop; account identity and permissions live in tool closures. */
export async function runAgentFeature(request: AgentFeatureRequest, deps: { transport?: typeof fetch } = {}) {
  const { model } = resolveModelRoute('assistant');
  const gateway = new GatewayClient(gatewayKey(), deps.transport);
  const prompt = await loadPromptTemplate('ticket-assistant', request.lang);
  const promptVersion = extractPromptVersion(prompt);
  const operations: { tool: string; result: OperationResult }[] = [];
  const completed = new Map<string, Promise<OperationResult>>();
  const log = async (record: LlmCallRecord) => {
    try { await request.logger?.(record); } catch { console.warn('[agent-feature] Call logging unavailable'); }
  };
  const tools: ToolSet = Object.fromEntries(request.tools.map((definition) => [definition.name, tool({
    description: definition.description,
    inputSchema: definition.inputSchema,
    outputSchema: OperationResultSchema,
    execute: async (input: unknown) => {
      const parsed = definition.inputSchema.parse(input);
      const key = JSON.stringify([definition.name, parsed]);
      let pending = completed.get(key);
      if (!pending) {
        pending = (async (): Promise<OperationResult> => {
          try { return OperationResultSchema.parse(await definition.execute(parsed)); }
          catch { return { status: 'failed', authorization: 'denied', data: {}, missing: ['tool_unavailable'], needsReview: true }; }
        })();
        completed.set(key, pending);
      }
      const result = await pending;
      operations.push({ tool: definition.name, result });
      return result;
    },
  })]));
  const started = Date.now();
  return withGeneration({
    name: 'ticket_assistant', model, input: request.messages,
    metadata: { promptVersion }, context: request.context,
  }, async (generation) => {
    try {
      await gateway.requireModel(model, 'language');
      const result = await generateText({
        model: gateway.sdk.languageModel(model),
        providerOptions: gatewayProviderOptions(model),
        system: prompt,
        messages: request.messages,
        tools,
        // Reasoning models reject a named tool_choice (HTTP 400), and limiting
        // activeTools on the first step leaves later steps without the other
        // tools. The first step therefore only requires a tool call; the prompt
        // asks for inspect_ticket first.
        prepareStep: ({ stepNumber }) => stepNumber === 0
          ? { toolChoice: 'required' }
          : stepNumber === 4 ? { toolChoice: 'none' } : {},
        stopWhen: isStepCount(5),
        maxOutputTokens: 1500,
        maxRetries: 0,
        abortSignal: request.signal ? AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
      });
      if (!result.text.trim()) throw new ProviderError(result.finishReason === 'length'
        ? 'Gateway assistant exceeded its token budget'
        : `Gateway assistant returned no final answer (finish=${result.finishReason}, steps=${result.steps.length})`, false);
      const usage = { promptTokens: result.totalUsage.inputTokens ?? null, completionTokens: result.totalUsage.outputTokens ?? null };
      const provenance = gatewayProvenance(result.providerMetadata, result.response.modelId);
      warnIfSystemCredential(provenance);
      const stepCosts = result.steps.map((step) => gatewayProvenance(step.providerMetadata, step.response.modelId).costUsd);
      provenance.costUsd = stepCosts.every((cost) => cost !== null)
        ? stepCosts.reduce<number>((total, cost) => total + (cost ?? 0), 0) : null;
      generation.update({ output: result.text, ...usageDetails(usage),
        metadata: { modelRole: 'assistant', reportedModel: provenance.model, costUsd: provenance.costUsd } });
      await log({
        feature: 'ticket_assistant', provider: 'gateway', model: provenance.model,
        promptVersion, promptText: prompt, responseText: result.text,
        ...usage, confidenceScore: null, latencyMs: Date.now() - started, errorCode: null, errorDetail: null,
        ...request.context,
      });
      return { text: result.text, operations, ...provenance, promptVersion, usage, finishReason: result.finishReason };
    } catch (error) {
      const safe = gatewayError(error);
      await log({
        feature: 'ticket_assistant', provider: 'gateway', model, promptVersion, promptText: prompt,
        responseText: null, promptTokens: null, completionTokens: null, confidenceScore: null,
        latencyMs: Date.now() - started, errorCode: 'LLM_ERROR', errorDetail: safe.message, ...request.context,
      });
      throw safe;
    }
  });
}
