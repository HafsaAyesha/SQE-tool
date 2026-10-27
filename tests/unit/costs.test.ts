import { describe, expect, it } from 'vitest';
import { costInputSchema } from '@/lib/costs/schema';
import { projectSchema } from '@/lib/projects/schema';
import { budgetProgress, PAGE_SIZE, selectRows } from '@/lib/costs/table';
import type { CostTableRow } from '@/lib/costs/types';
const valid = { item: 'Cloud', group: '', category: '', estimated: '', actual: '12.50', date: '', notes: '' };
const row = (id: string, extra: Partial<CostTableRow> = {}): CostTableRow => ({ id, item: id, group: null, category: null, estimated: null, actual: null, currency: 'USD', date: null, notes: null, sourceRef: null, confidence: null, sourceId: null, sourceName: null, type: 'manual', ...extra });
describe('manual cost validation', () => {
  it('normalizes blanks to null, trims text and preserves zero', () => {
    expect(costInputSchema.parse({ ...valid, item: ' Cloud ', actual: '0' })).toEqual({ item: 'Cloud', group: null, category: null, estimated: null, actual: 0, date: null, notes: null });
  });
  it('rejects missing names, negatives, non-finite values, overflow and excess precision', () => {
    for (const input of [{ ...valid, item: ' ' }, ...[-1, Infinity, NaN, 1e12, .001, 1e-9].map(actual => ({ ...valid, actual })), { ...valid, estimated: 'abc' }]) expect(costInputSchema.safeParse(input).success).toBe(false);
    expect(costInputSchema.parse({ ...valid, actual: '999999999999.99' }).actual).toBe(999999999999.99);
  });
  it('checks text lengths and real calendar dates', () => {
    for (const [field, length] of [['item', 201], ['group', 121], ['category', 81], ['notes', 2001]] as const) expect(costInputSchema.safeParse({ ...valid, [field]: 'x'.repeat(length) }).success).toBe(false);
    expect(costInputSchema.safeParse({ ...valid, date: '2025-02-29' }).success).toBe(false);
    expect(costInputSchema.parse({ ...valid, date: '2024-02-29' }).date).toBe('2024-02-29');
  });
  it('validates projects and discards forged ownership fields', () => {
    expect(projectSchema.parse({ name: ' Demo ', currency: 'PKR', owner_id: 'forged' })).toEqual({ name: 'Demo', currency: 'PKR' });
    for (const input of [{ name: '', currency: 'USD' }, { name: 'x'.repeat(121), currency: 'USD' }, { name: 'Demo', currency: 'FAKE' }]) expect(projectSchema.safeParse(input).success).toBe(false);
  });
});
describe('table transforms and budget display', () => {
  const rows = [row('Zebra', { actual: 2, estimated: 5, group: 'Build', category: 'Cloud', sourceName: 'Z spreadsheet', type: 'csv', sourceId: 'source-z' }), row('alpha', { actual: 10, estimated: 2, group: 'Test', category: 'Tools', date: '2026-01-02' }), row('Empty', { sourceName: 'A spreadsheet', type: 'csv', sourceId: 'source-a' })];
  it('combines case-insensitive search with exact group and category filters', () => {
    expect(selectRows(rows, { search: ' ZEB ', group: 'Build', category: 'Cloud', sort: 'item', direction: 'asc' }).map(row => row.id)).toEqual(['Zebra']);
    expect(selectRows(rows, { search: '', group: 'Build', category: 'Tools', sort: 'item', direction: 'asc' })).toEqual([]);
  });
  it('sorts numeric values numerically and leaves nulls last in both directions', () => {
    for (const [direction, expected] of [['asc', ['Zebra', 'alpha', 'Empty']], ['desc', ['alpha', 'Zebra', 'Empty']]] as const) expect(selectRows(rows, { search: '', group: '', category: '', sort: 'actual', direction }).map(row => row.id)).toEqual(expected);
    expect(rows[0].id).toBe('Zebra');
    expect(PAGE_SIZE).toBe(50);
  });
  it('sorts each text/date/numeric/source column including variance and status', () => {
    const expected = {
      item: ['alpha', 'Empty', 'Zebra'], group: ['Zebra', 'alpha', 'Empty'], category: ['Zebra', 'alpha', 'Empty'],
      estimated: ['alpha', 'Zebra', 'Empty'], actual: ['Zebra', 'alpha', 'Empty'],
      date: ['alpha', 'Zebra', 'Empty'], source: ['Empty', 'alpha', 'Zebra'],
      variance: ['Zebra', 'alpha', 'Empty'], percentVariance: ['Zebra', 'alpha', 'Empty'], status: ['alpha', 'Zebra', 'Empty'],
    };
    for (const sort of Object.keys(expected) as (keyof typeof expected)[]) expect(selectRows(rows, { search: '', group: '', category: '', sort, direction: 'asc' }).map(row => row.id)).toEqual(expected[sort]);
  });
  it('handles zero estimates and caps over-budget progress', () => {
    expect(budgetProgress(100, 80)).toEqual({ percent: 80, over: false });
    expect(budgetProgress(100, 150)).toEqual({ percent: 100, over: true });
    expect(budgetProgress(0, 0)).toEqual({ percent: 0, over: false });
    expect(budgetProgress(0, 1)).toEqual({ percent: 100, over: true });
  });
});

describe('computed table ordering', () => {
  it('sorts variance and percentage independently and keeps undefined percentages last', () => {
    const rows=[row('Large',{estimated:100,actual:200}),row('Small',{estimated:10,actual:50}),row('Missing',{estimated:null,actual:20}),row('Zero',{estimated:0,actual:10})];
    const filters={search:'',group:'',category:''};
    expect(selectRows(rows,{...filters,sort:'variance',direction:'asc'}).map(r=>r.id)).toEqual(['Zero','Small','Large','Missing']);
    expect(selectRows(rows,{...filters,sort:'variance',direction:'desc'}).map(r=>r.id)).toEqual(['Large','Small','Zero','Missing']);
    expect(selectRows(rows,{...filters,sort:'percentVariance',direction:'asc'}).map(r=>r.id)).toEqual(['Large','Small','Missing','Zero']);
    expect(selectRows(rows,{...filters,sort:'percentVariance',direction:'desc'}).map(r=>r.id)).toEqual(['Small','Large','Missing','Zero']);
  });
});
