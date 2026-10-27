import { z } from 'zod';
function nullableText(max: number) {
  return z.preprocess(value => typeof value === 'string' ? value.trim() || null : value, z.string().max(max, `Use at most ${max} characters.`).nullable());
}
const amount = z.preprocess(value => {
  if (value === null || value === '') return null;
  if (typeof value === 'string') return value.trim() === '' ? null : Number(value);
  return value;
}, z.number({ invalid_type_error: 'Enter a valid number.' }).finite().min(0, 'Amounts cannot be negative.').max(999999999999.99, 'Amount is too large.').refine(value => { const [coefficient, exponent = '0'] = value.toString().split('e'); return (coefficient.split('.')[1]?.length ?? 0) - Number(exponent) <= 2; }, 'Use at most 2 decimal places.').nullable());
export const costInputSchema = z.object({
  item: z.string().trim().min(1, 'Enter an item name.').max(200, 'Use at most 200 characters.'),
  group: nullableText(120),
  category: nullableText(80),
  estimated: amount,
  actual: amount,
  date: z.preprocess(value => value === '' ? null : value, z.string().date('Enter a valid date.').nullable()),
  notes: nullableText(2000),
});
export type CostInput = z.infer<typeof costInputSchema>;
