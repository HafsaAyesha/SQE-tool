import { z } from 'zod';
export const currencies = ['USD', 'PKR', 'EUR', 'GBP', 'AED', 'CAD', 'AUD', 'JPY', 'INR', 'SAR', 'CNY', 'CHF', 'SGD'] as const;
export const projectSchema = z.object({
  name: z.string().trim().min(1, 'Enter a project name.').max(120, 'Use at most 120 characters.'),
  currency: z.enum(currencies, { errorMap: () => ({ message: 'Choose a supported currency.' }) }),
});
export const projectNameSchema = projectSchema.pick({ name: true });
export const idSchema = z.string().uuid('Invalid identifier.');
export type Project = { id: string; owner_id: string; name: string; currency: string; created_at: string };
export type ProjectOption = Pick<Project, 'id' | 'name' | 'currency'>;
export type ProjectSummary = Project & { item_count: number; total_estimated: number; total_actual: number; other_currency_count: number };
