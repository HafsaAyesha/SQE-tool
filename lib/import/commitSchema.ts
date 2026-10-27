import { z } from 'zod';
import { importRowSchema, mappingSchema } from './mapping';
export const commitSchema = z.object({
  source: z.object({ id: z.string().uuid().optional(), type: z.string().min(1).max(80), name: z.string().min(1).max(255) }).strict(),
  mapping: mappingSchema, columns: z.array(z.string().min(1).max(256)).min(1).max(256),
  currency: z.string().regex(/^[A-Z]{3}$/), decimal: z.enum(['auto', 'dot', 'comma']).default('auto'),
  mode: z.enum(['append', 'replace']), rows: z.array(importRowSchema).min(1).max(5000),
  templateName: z.string().trim().min(1).max(120).optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.mapping.item) ctx.addIssue({ code: 'custom', path: ['mapping'], message: 'Map an item column before saving.' });
  if (Object.values(value.mapping).some(column => !value.columns.includes(column))) ctx.addIssue({ code: 'custom', path: ['mapping'], message: 'Mapped columns must exist in the source.' });
  if (value.mode === 'replace' && !value.source.id) ctx.addIssue({ code: 'custom', path: ['source'], message: 'Select an existing source to replace.' });
});
