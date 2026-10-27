import { describe, expect, it } from 'vitest';
import { applyMapping, importRowSchema, parseAmount, parseDate, suggestMapping } from '@/lib/import/mapping';
import { escapeFormula } from '@/lib/security/sanitize';
import { commitSchema } from '@/lib/import/commitSchema';
import type { RawTable } from '@/lib/import/schema';
describe('shared import mapping', () => {
  it('suggests synonyms with confidence, camel case and unique columns', () => {
    const result = suggestMapping(['Task', 'WBS', 'Cost Type', 'BaselineCost', 'cost to date', 'Start']);
    expect(result.mapping).toEqual({ item: 'Task', group: 'WBS', category: 'Cost Type', estimated: 'BaselineCost', actual: 'cost to date', date: 'Start' });
    expect(result.confidence.estimated).toBe(1);
    expect(suggestMapping(['Unusual heading']).mapping).toEqual({});
    expect(suggestMapping(['Budget USD']).confidence.estimated).toBe(.8);
  });
  it.each([['$1,234.50',1234.5], ['€1.234,50',1234.5], ['(£1,234.50)',-1234.5], ['1 234,50',1234.5], ["CHF 1'234.50",1234.5], ['1,234',1234], ['1.234.567',1234567], ['-12,50',-12.5], ['',null]])('parses %s', (input, expected) => expect(parseAmount(input)).toBe(expected));
  it('offers explicit decimal conventions without accepting damaged numbers', () => {
    expect(parseAmount('1.234', 'comma')).toBe(1234);
    expect(parseAmount('1,234', 'comma')).toBe(1.234);
    for (const bad of ['12abc','12,34,56','1.2.3','1,23.45','--1']) expect(parseAmount(bad)).toBeNaN();
  });
  it('handles Excel leap-year correction and calendar dates', () => {
    expect(parseDate(1)).toBe('1900-01-01'); expect(parseDate(61)).toBe('1900-03-01');
    expect(parseDate(45292)).toBe('2024-01-01'); expect(parseDate('45292')).toBe('2024-01-01'); expect(parseDate(60)).toBe('invalid');
    expect(parseDate('31/12/2025')).toBe('2025-12-31'); expect(parseDate('2025-03')).toBe('2025-03-01');
  });
  it('keeps row-indexed errors, allows corrections and does not truncate long notes', () => {
    const raw: RawTable = { columns: ['Strange label','Money','When','Memo'], rows: [{ 'Strange label':'Hosting', Money:'€1.234,50', When:45292, Memo:null }, { 'Strange label':'', Money:'broken', When:'2025-02-30', Memo:'x'.repeat(10000) }], meta: { sourceType:'csv', fileName:'unusual.csv', warnings:[] } };
    const result = applyMapping(raw, { item:'Strange label', actual:'Money', date:'When', notes:'Memo' }, { currency:'EUR' });
    expect(result.rows).toHaveLength(1); expect(result.rows[0]).toMatchObject({ actual:1234.5, date:'2024-01-01', currency:'EUR' });
    expect(result.errors.map(error => error.field)).toEqual(expect.arrayContaining(['item','actual','date','notes']));
    expect(result.errors.every(error => error.row === 1)).toBe(true);
    expect(() => applyMapping(raw, { item:'missing' }, { currency:'USD' })).toThrow();
  });
  it('enforces the storage precision and ranges while permitting credits', () => {
    const base = { item:'Credit', group:null, category:null, estimated:null, actual:-25.5, currency:'USD', date:null, notes:null, sourceRef:null, confidence:null };
    expect(importRowSchema.safeParse(base).success).toBe(true);
    for (const actual of [NaN, Infinity, 1.001, 1e-9, 1000000000000]) expect(importRowSchema.safeParse({ ...base, actual }).success).toBe(false);
    expect(commitSchema.safeParse({ source:{type:'csv',name:'a'}, mapping:{item:'Item'}, columns:['Item'],currency:'USD',mode:'replace',rows:[base] }).success).toBe(false);
  });
  it('escapes spreadsheet formulas and preserves ordinary text', () => {
    for (const input of ['=SUM(A1:A2)','+cmd','-cmd','@SUM(A1)','\t =1']) expect(escapeFormula(input)).toBe("'"+input);
    expect(escapeFormula('Cloud hosting')).toBe('Cloud hosting'); expect(escapeFormula("'=1")).toBe("'=1");
  });
});
