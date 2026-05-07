import { z } from "zod";
import { ClassificationSchema } from "@kairo/intelligence";

// Canonical classification contract lives in @kairo/intelligence.
// Re-export so apps/api consumers have a single import surface.
export const ClassificationOutputSchema = ClassificationSchema;
export type ClassificationOutput = z.infer<typeof ClassificationOutputSchema>;

// ---------------------------------------------------------------------------
// Single classify — response
// ---------------------------------------------------------------------------

export const ClassifyResponseSchema = z.object({
  ticket_id: z.string().uuid(),
  classification: ClassificationOutputSchema,
  classified_at: z.string(),
  tier: z.number().int(),
});

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

// ---------------------------------------------------------------------------
// Correct classification — request (KAI-123)
// ---------------------------------------------------------------------------

export const CorrectClassificationSchema = z.object({
  correct_ticket_type: z.enum(["support", "prospect", "spam", "internal", "other"]).optional(),
  correct_priority:    z.enum(["P1", "P2", "P3"]).optional(),
  correct_category:    z.enum(["technical", "billing", "account", "general", "not_applicable"]).optional(),
  correct_sentiment:   z.enum(["aggressive", "frustrated", "neutral", "positive"]).optional(),
  notes:               z.string().max(2000).optional(),
}).refine(
  (v) => v.correct_ticket_type || v.correct_priority || v.correct_category || v.correct_sentiment,
  { message: "At least one correction field is required" }
);

export type CorrectClassification = z.infer<typeof CorrectClassificationSchema>;
