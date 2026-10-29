import { z } from 'zod';
export const costRowSchema = z.object({
  item: z.string().trim().min(1).max(200),
  group: z.string().max(120).nullable(), category: z.string().max(80).nullable(),
  estimated: z.number().finite().nullable(), actual: z.number().finite().nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/).default('USD'), date: z.string().date().nullable(),
  notes: z.string().max(2000).nullable(), sourceRef: z.string().max(512).nullable(),
  confidence: z.number().min(0).max(1).nullable(),
}).strict();
export type CostRow = z.infer<typeof costRowSchema>;
export const extractionEstimateSchema=z.object({units:z.number().int().min(1).max(20),kind:z.string().max(40),inputTokens:z.number().int().nonnegative(),outputTokens:z.number().int().nonnegative(),estimatedUsd:z.number().nonnegative(),visual:z.boolean()});
export const sourcePreviewSchema=z.object({sourceRef:z.string().max(512),text:z.string().max(50000).optional(),thumbnail:z.string().max(500000).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/).optional()});
export const rawTableSchema = z.object({
  columns: z.array(z.string().min(1).max(256)).min(1).max(256),
  rows: z.array(z.record(z.string(),z.unknown())).min(1).max(5000),
  meta: z.object({ sourceType: z.string().min(1).max(80), fileName: z.string().max(255), sheet: z.string().max(256).optional(), warnings: z.array(z.string().max(1000)).max(100), fileHash:z.string().regex(/^[a-f0-9]{64}$/).optional(), ai:z.boolean().optional(),mediaJobId:z.string().uuid().optional(),playbackUrl:z.string().url().max(8192).optional(),mediaType:z.enum(['audio','video']).optional(), previews:z.array(sourcePreviewSchema).max(40).optional(), estimate:extractionEstimateSchema.optional(), sheets: z.array(z.string().max(256)).max(200).optional(), jsonPaths: z.array(z.string().max(1024)).max(100).optional(), tables: z.array(z.string().max(256)).max(100).optional(), tableIndex: z.number().int().min(0).max(99).optional() }),
});
export type RawTable = z.infer<typeof rawTableSchema>;
export const parseOptionsSchema = z.object({ fileName: z.string().min(1).max(255).optional(), mimeType: z.string().max(200).optional(), sheet: z.string().max(256).optional(), jsonPath: z.string().max(1024).optional(), headerName: z.string().max(100).optional(), apiKey: z.string().max(8192).optional(), tableIndex: z.number().int().min(0).max(99).optional(), autoDetect: z.boolean().optional(), projectId:z.string().uuid().optional(), currency:z.string().regex(/^[A-Z]{3}$/).optional(), confirmAi:z.boolean().optional(), depth:z.number().int().min(0).max(1).optional() });
export type ParseOptions = z.infer<typeof parseOptionsSchema>;
export const parseResponseSchema = rawTableSchema.extend({ totalCount: z.number().int().min(1).max(5000), previewLimit: z.literal(200), sourceId: z.string().uuid().optional() });
export type ParseResponse = z.infer<typeof parseResponseSchema>;
