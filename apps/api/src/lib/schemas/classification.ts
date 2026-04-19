import { z } from "zod";

export const ClassificationOutputSchema = z.object({
  tipo: z.enum(["support", "lead", "spam"]),
  prioridad: z.enum(["P1", "P2", "P3"]),
  categoria: z.enum(["technical", "billing", "sales", "other"]),
  sentimiento: z.enum(["urgente", "neutral", "casual"]),
  razonamiento: z.string(),
  confianza: z.number().min(0).max(1),
});

export const ClassifyResponseSchema = z.object({
  ticket_id: z.string().uuid(),
  classification: ClassificationOutputSchema,
  classified_at: z.string(),
  tier: z.number().int(),
});

export type ClassificationOutput = z.infer<typeof ClassificationOutputSchema>;
export type ClassifyResponse = z.infer<typeof ClassifyResponseSchema>;

// ---------------------------------------------------------------------------
// Batch classify — request
// ---------------------------------------------------------------------------

export const ClassifyBatchRequestSchema = z.object({
  ticket_ids: z.array(z.string().uuid()).min(1).max(200),
  force_reclassify: z.boolean().default(false),
});

export type ClassifyBatchRequest = z.infer<typeof ClassifyBatchRequestSchema>;

// ---------------------------------------------------------------------------
// Batch classify — per-ticket result
// ---------------------------------------------------------------------------

export const BatchTicketResultSchema = z.object({
  ticket_id: z.string().uuid(),
  status: z.enum(["success", "skipped", "protected", "failed"]),
  reason: z.string().optional(),
  classification: ClassificationOutputSchema.optional(),
});

export type BatchTicketResult = z.infer<typeof BatchTicketResultSchema>;

// ---------------------------------------------------------------------------
// Batch classify — sync response (≤ BATCH_SYNC_LIMIT)
// ---------------------------------------------------------------------------

export const ClassifyBatchSyncResponseSchema = z.object({
  mode: z.literal("sync"),
  total: z.number().int(),
  processed: z.number().int(),
  skipped: z.number().int(),
  protected: z.number().int(),
  failed: z.number().int(),
  results: z.array(BatchTicketResultSchema),
});

export type ClassifyBatchSyncResponse = z.infer<typeof ClassifyBatchSyncResponseSchema>;

// ---------------------------------------------------------------------------
// Batch classify — async response (> BATCH_SYNC_LIMIT)
// ---------------------------------------------------------------------------

export const ClassifyBatchAsyncResponseSchema = z.object({
  mode: z.literal("async"),
  job_id: z.string().uuid(),
  status: z.literal("queued"),
  total: z.number().int(),
});

export type ClassifyBatchAsyncResponse = z.infer<typeof ClassifyBatchAsyncResponseSchema>;
