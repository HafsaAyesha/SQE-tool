import { describe, expect, it } from 'vitest';
import { cumulativeByDate, rowVariance, rowVariancePct, status, summarise, totals, type CalculationRow } from '@/lib/costs/calc';
const row = (estimated: number | null, actual: number | null, extra: Partial<CalculationRow> = {}): CalculationRow => ({ estimated, actual, currency:'USD', ...extra });
const codeAudit = [row(3000,2800,{group:'Build',category:'Labour',sourceId:'csv-a',date:'2026-10-01'}),row(100,80,{group:'Build',category:'Cloud',sourceId:'csv-a',date:'2026-10-02'}),row(200,250,{group:'Test',category:'AI API',sourceId:'json-b',date:'2026-10-03'})];
describe('row calculations', () => {
  it('uses decimal-safe subtraction and signed percentage points', () => {
    expect(rowVariance(row(.1,.3))).toBe(.2);
    expect(rowVariance(row(3000,2800))).toBe(-200);
    expect(rowVariancePct(row(200,250))).toBe(25);
    expect(rowVariancePct(row(100,80))).toBe(-20);
  });
  it('distinguishes missing values from known zero amounts', () => {
    for(const value of [row(null,10),row(10,null),row(null,null)]) { expect(rowVariance(value)).toBeNull();expect(rowVariancePct(value)).toBeNull();expect(status(value)).toBe('unknown'); }
    expect(rowVariance(row(0,10))).toBe(10);expect(rowVariancePct(row(0,10))).toBeNull();
    expect(rowVariance(row(0,0))).toBe(0);expect(rowVariancePct(row(0,0))).toBeNull();
  });
  it('treats ±5% boundaries inclusively and compares small amounts exactly', () => {
    expect(status(row(100,95))).toBe('on');expect(status(row(100,105))).toBe('on');
    expect(status(row(100,94.99))).toBe('under');expect(status(row(100,105.01))).toBe('over');
    expect(status(row(.2,.21))).toBe('on');expect(status(row(.2,.22))).toBe('over');
    expect(status(row(100,102),1)).toBe('over');expect(status(row(100,100),0)).toBe('on');
    for(const band of [-1,NaN,Infinity]) expect(()=>status(row(100,100),band)).toThrow(RangeError);
  });
  it('classifies zero baselines and negative credits without changing the percentage formula', () => {
    expect(status(row(0,0))).toBe('on');expect(status(row(0,1))).toBe('over');expect(status(row(0,-1))).toBe('under');
    expect(rowVariance(row(-100,-80))).toBe(20);expect(rowVariancePct(row(-100,-80))).toBe(-20);expect(status(row(-100,-80))).toBe('over');
    expect(status(row(-100,-120))).toBe('under');expect(status(row(-100,-105))).toBe('on');
  });
  it('normalizes negative zero and rounds fractional-cent inputs once, half up', () => {
    expect(Object.is(rowVariance(row(-0,0)),-0)).toBe(false);
    expect(rowVariance(row(1,1.005))).toBe(.01);expect(rowVariance(row(1,1.004))).toBe(0);
    for(const value of [NaN,Infinity,-Infinity,1e12]) expect(()=>rowVariance(row(0,value))).toThrow(RangeError);
  });
});
describe('totals and summaries', () => {
  it('matches the CodeAudit fixture totals and counts only over-band rows', () => {
    const result=totals(codeAudit);
    expect(result).toMatchObject({estimated:3300,actual:3130,variance:-170,itemCount:3,overCount:1,missingCount:0});
    expect(result.variancePct).toBeCloseTo(-5.1515151515,8);
    expect(totals([row(100,101),row(100,105),row(100,106)]).overCount).toBe(1);
  });
  it('sums known amounts independently and counts rows missing either amount once', () => {
    expect(totals([row(100,null),row(null,50),row(null,null)])).toEqual({estimated:100,actual:50,variance:-50,variancePct:-50,itemCount:3,overCount:0,missingCount:3});
    expect(totals([])).toEqual({estimated:0,actual:0,variance:0,variancePct:null,overCount:0,itemCount:0,missingCount:0});
    expect(totals([row(0,5)]).variancePct).toBeNull();
  });
  it('has no accumulated floating-point tails or silently lost cents', () => {
    expect(totals([row(.1,.2),row(.2,.1)])).toMatchObject({estimated:.3,actual:.3,variance:0,variancePct:0});
    expect(totals(Array.from({length:5000},()=>row(.01,.02)))).toMatchObject({estimated:50,actual:100,variance:50});
    expect(totals([row(0,-.1),row(0,-.2)]).actual).toBe(-.3);
    const tooLarge=[...Array.from({length:100},()=>row(0,999999999999.99)),row(0,.01)];
    expect(()=>totals(tooLarge)).toThrow(/represent accurately/);
  });
  it('groups by group/category with missing labels and weighted percentages', () => {
    expect(summarise(codeAudit,'group')).toEqual([
      {key:'Build',estimated:3100,actual:2880,variance:-220,variancePct:expect.closeTo(-7.0967741935,8),count:2,overCount:0},
      {key:'Test',estimated:200,actual:250,variance:50,variancePct:25,count:1,overCount:1},
    ]);
    expect(summarise([row(100,150,{category:'Cloud'}),row(900,900,{category:'Cloud'})],'category')[0].variancePct).toBe(5);
    expect(summarise([row(null,0)],'group')[0].key).toBe('Ungrouped');expect(summarise([row(null,0)],'category')[0].key).toBe('Uncategorised');
  });
  it('uses stable source IDs, supports standard source metadata and does not conflate identical names', () => {
    expect(summarise([row(1,1,{sourceId:'a',sourceName:'Costs'}),row(2,2,{sourceId:'b',sourceName:'Costs'}),row(3,3,{sourceId:null,type:'manual'})],'source').map(r=>r.key)).toEqual(['a','b','Manual']);
    expect(summarise([row(1,1,{source:'CSV'})],'source')[0].key).toBe('CSV');
    expect(summarise([row(1,1)],'source')[0].key).toBe('Unknown source');
  });
  it('groups months in chronological order and keeps undated rows visible', () => {
    expect(summarise([row(1,2,{date:'2026-02-01'}),row(1,2,{date:'2025-12-01'}),row(1,2,{date:null}),row(1,2,{date:'2026-02-28'})],'month').map(r=>[r.key,r.count])).toEqual([['2025-12',1],['2026-02',2],['Undated',1]]);
    expect(summarise([],'month')).toEqual([]);
  });
  it('rejects mixed currencies rather than silently converting or adding them', () => {
    const mixed=[row(1,2),row(1,2,{currency:'EUR'})];
    expect(()=>totals(mixed)).toThrow(/one currency/);expect(()=>summarise(mixed,'group')).toThrow(/one currency/);expect(()=>cumulativeByDate(mixed)).toThrow(/one currency/);
  });
});
describe('date accumulation and purity', () => {
  it('sorts dates, combines same-day rows, skips undated rows and sums missing amounts as zero', () => {
    expect(cumulativeByDate([row(.1,.2,{date:'2026-01-02'}),row(.2,.1,{date:'2026-01-01'}),row(null,.2,{date:'2026-01-01'}),row(999,999)])).toEqual([
      {date:'2026-01-01',cumEstimated:.2,cumActual:.3},{date:'2026-01-02',cumEstimated:.3,cumActual:.5},
    ]);
    expect(cumulativeByDate(codeAudit)).toEqual([{date:'2026-10-01',cumEstimated:3000,cumActual:2800},{date:'2026-10-02',cumEstimated:3100,cumActual:2880},{date:'2026-10-03',cumEstimated:3300,cumActual:3130}]);
    expect(cumulativeByDate([])).toEqual([]);
  });
  it('rejects invalid calendar dates and handles leap days', () => {
    for(const date of ['2025-02-29','2026-02-30','not-a-date','2026-1-1']) {expect(()=>cumulativeByDate([row(1,1,{date})])).toThrow(/ISO calendar/);expect(()=>summarise([row(1,1,{date})],'month')).toThrow(/ISO calendar/);}
    expect(cumulativeByDate([row(1,1,{date:'2024-02-29'})])[0].date).toBe('2024-02-29');
  });
  it('does not mutate rows, input order or Decimal global defaults', async () => {
    const Decimal=(await import('decimal.js')).default;const precision=Decimal.precision;
    const input=Object.freeze(codeAudit.map(r=>Object.freeze({...r})).reverse());const before=JSON.stringify(input);
    totals(input);summarise(input,'group');cumulativeByDate(input);input.forEach(r=>{rowVariance(r);rowVariancePct(r);status(r);});
    expect(JSON.stringify(input)).toBe(before);expect(Decimal.precision).toBe(precision);
  });
});
