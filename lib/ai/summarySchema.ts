import {z} from 'zod';
export const insightSummarySchema=z.object({
 headline:z.string().trim().min(1).max(160),
 summary:z.string().trim().max(5000).refine(value=>{const words=value.split(/\s+/u).filter(Boolean).length;return words>=150&&words<=200;},'Write 150 to 200 words in the summary.'),
 keyFindings:z.array(z.string().trim().min(1).max(450)).min(3).max(5),
 anomalies:z.array(z.object({rowId:z.string().min(1).max(128),likelyCause:z.string().trim().min(1).max(350),suggestedAction:z.string().trim().min(1).max(350)}).strict()).max(40),
 recommendations:z.array(z.string().trim().min(1).max(450)).length(3),
}).strict();
export type InsightSummary=z.infer<typeof insightSummarySchema>;

export const summaryFiltersSchema=z.object({source:z.union([z.string().uuid(),z.literal('manual')]).optional(),category:z.string().min(1).max(80).optional(),group:z.string().min(1).max(120).optional(),from:z.string().date().optional(),to:z.string().date().optional(),q:z.string().min(1).max(200).optional()}).strict().refine(filters=>!filters.from||!filters.to||filters.from<=filters.to,'The date range is invalid.');
export const summaryRequestSchema=z.object({filters:summaryFiltersSchema.default({}),regenerate:z.boolean().default(false)}).strict();
export type SummaryFilters=z.infer<typeof summaryFiltersSchema>;
