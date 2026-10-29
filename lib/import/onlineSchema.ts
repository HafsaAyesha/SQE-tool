import { z } from 'zod';
import { sourceHeaders } from '@/lib/security/sourceHeaders';
export const onlineTypes = ['auto', 'gsheets', 'url', 'html'] as const;
export const onlineRequestSchema = z.object({
  type: z.enum(onlineTypes), url: z.string().trim().url('Enter a valid URL.').max(4096),
  headerName: z.string().max(100).optional(), apiKey: z.string().min(1).max(8192).optional(),
  jsonPath: z.string().max(1024).optional(), tableIndex: z.number().int().min(0).max(99).optional(),
  confirmAi:z.boolean().optional(),
  saveSource: z.boolean().default(false), sourceId: z.string().uuid().optional(),
}).strict().superRefine((value, context) => {
  try { sourceHeaders(value.headerName, value.apiKey); }
  catch { context.addIssue({ code: z.ZodIssueCode.custom, path: ['headerName'], message: 'Choose a valid API-key header and value. Routing, cookie and proxy headers are not allowed.' }); }
});
export type OnlineInput = z.infer<typeof onlineRequestSchema>;
