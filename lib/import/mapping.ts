import { z } from 'zod';
import { costRowSchema, type CostRow, type RawTable } from './schema';
export const fields = ['item', 'group', 'category', 'estimated', 'actual', 'currency', 'date', 'notes', 'sourceRef', 'confidence'] as const;
export type CostField = typeof fields[number];
export const mappingSchema = z.record(z.enum(fields), z.string().min(1).max(256)).superRefine((map, ctx) => {
  const values = Object.values(map);
  if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', message: 'Each column can map to only one field.' });
});
export type ColumnMapping = z.infer<typeof mappingSchema>;
export const synonyms: Record<CostField, string[]> = {
  item: ['item', 'task', 'name', 'description', 'line item'],
  group: ['group', 'phase', 'WBS', 'stage', 'milestone', 'work package'],
  category: ['category', 'type', 'cost type', 'account'],
  estimated: ['estimated', 'estimate', 'budget', 'planned', 'baseline', 'forecast', 'BAC', 'baseline cost'],
  actual: ['actual', 'spent', 'cost to date', 'AC', 'actual cost', 'paid'],
  currency: ['currency', 'currency code', 'ccy'], date: ['date', 'start', 'period', 'month'],
  notes: ['notes', 'note', 'comment', 'comments'], sourceRef: ['source ref', 'reference', 'sourceRef'], confidence: ['confidence'],
};
const normalized = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function suggestMapping(columns: string[]) {
  const mapping: ColumnMapping = {}; const confidence: Partial<Record<CostField, number>> = {}; const used = new Set<string>();
  for (const field of fields) {
    const scored = columns.filter(column => !used.has(column)).map(column => {
      const text = normalized(column); const names = synonyms[field].map(normalized);
      const score = names.includes(text) ? 1 : names.some(name => name.length > 2 && (text.startsWith(name + ' ') || text.endsWith(' ' + name))) ? .8 : 0;
      return { column, score };
    }).sort((a, b) => b.score - a.score);
    if (scored[0]?.score) { mapping[field] = scored[0].column; confidence[field] = scored[0].score; used.add(scored[0].column); }
  }
  return { mapping, confidence };
}
export type MappingOptions = { currency: string; decimal?: 'auto' | 'dot' | 'comma' };
export function parseAmount(input: unknown, decimal: MappingOptions['decimal'] = 'auto'): number | null {
  if (input == null || input === '') return null;
  if (typeof input === 'number') return input;
  if (typeof input !== 'string') return NaN;
  let value = input.trim(); if (!value) return null;
  const brackets = /^\(.*\)$/.test(value); if (brackets) value = value.slice(1, -1).trim();
  value = value.replace(/(?:USD|EUR|GBP|PKR|INR|CAD|AUD|JPY|CHF|AED|SAR|CNY|BDT)/gi, '').replace(/\p{Sc}/gu, '').replace(/[\s\u00a0\u202f']/g, '');
  if (!/^[+-]?\d[\d.,]*$/.test(value)) return NaN;
  const comma = value.lastIndexOf(','); const dot = value.lastIndexOf('.');
  let separator = decimal === 'comma' ? ',' : decimal === 'dot' ? '.' : comma >= 0 && dot >= 0 ? comma > dot ? ',' : '.' : comma >= 0 ? /^[-+]?\d{1,3}(,\d{3})+$/.test(value) ? '.' : ',' : '.';
  if (decimal === 'auto' && comma < 0 && /^[-+]?\d{1,3}(\.\d{3})+$/.test(value)) separator = ',';
  const thousands = separator === ',' ? '.' : ',';
  const pieces = value.split(separator);
  if (pieces.length > 2) return NaN;
  if (pieces[1]?.includes(thousands)) return NaN;
  const integer = pieces[0];
  if (integer.includes(thousands) && !new RegExp(`^[+-]?\\d{1,3}(\\${thousands}\\d{3})+$`).test(integer)) return NaN;
  value = integer.split(thousands).join('') + (pieces.length === 2 ? '.' + pieces[1] : '');
  const number = Number(value); return brackets ? -Math.abs(number) : number;
}
export function parseDate(input: unknown): string | null {
  if (input == null || input === '') return null;
  if (typeof input === 'string' && /^\d+(?:\.\d+)?$/.test(input.trim())) input = Number(input);
  if (typeof input === 'number' && Number.isFinite(input) && input >= 1 && input <= 2958465) {
    const days = Math.floor(input); if (days === 60) return 'invalid'; // Excel's fictitious 1900-02-29.
    return new Date(Date.UTC(1899, 11, 31) + (days > 60 ? days - 1 : days) * 86400000).toISOString().slice(0, 10);
  }
  const value = String(input).trim();
  if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return value.slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(value)) return value + '-01';
  const match = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : value;
}
const importedAmount = z.number().finite().min(-999999999999.99).max(999999999999.99).refine(value => { const [n, e = '0'] = value.toString().split('e'); return (n.split('.')[1]?.length ?? 0) - Number(e) <= 2; }, 'Use at most 2 decimal places.').nullable();
export const importRowSchema = costRowSchema.extend({ estimated: importedAmount, actual: importedAmount });
export type RowError = { row: number; field: CostField; message: string };
export type Candidate = Record<CostField, unknown>;
export function validateCandidates(candidates: Candidate[]) {
  const rows: CostRow[] = []; const errors: RowError[] = [];
  candidates.forEach((candidate, row) => { const result = importRowSchema.safeParse(candidate); if (result.success) rows.push(result.data); else result.error.issues.forEach(issue => errors.push({ row, field: issue.path[0] as CostField, message: issue.message })); });
  return { rows, errors, candidates };
}
export function applyMapping(rawTable: RawTable, mapping: ColumnMapping, options: MappingOptions) {
  mappingSchema.parse(mapping);
  for (const column of Object.values(mapping)) if (!rawTable.columns.includes(column)) throw new Error('A mapped column is missing from this source.');
  const text = (value: unknown) => value == null || value === '' ? null : typeof value === 'object' ? JSON.stringify(value) : String(value).trim() || null;
  const candidates: Candidate[] = rawTable.rows.map((row, index) => {
    const get = (field: CostField) => mapping[field] ? row[mapping[field]!] : null;
    return { item: text(get('item')) ?? '', group: text(get('group')), category: text(get('category')), estimated: parseAmount(get('estimated'), options.decimal), actual: parseAmount(get('actual'), options.decimal), currency: text(get('currency'))?.toUpperCase() ?? options.currency, date: parseDate(get('date')), notes: text(get('notes')), sourceRef: text(get('sourceRef')) ?? `${rawTable.meta.sheet ?? rawTable.meta.fileName}:row ${index + 2}`, confidence: get('confidence') == null || get('confidence') === '' ? null : Number(get('confidence')) };
  });
  return validateCandidates(candidates);
}
