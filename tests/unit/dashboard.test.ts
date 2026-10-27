import { describe, expect, it } from 'vitest';
import { alignBurnSeries, burnSeries, dashboardModel, filterDashboardRows, readDashboardFilters, updateDashboardQuery } from '@/lib/costs/dashboard';
import { summaryKey } from '@/lib/costs/calc';
import type { CostTableRow } from '@/lib/costs/types';
const source='11111111-1111-4111-8111-111111111111';
const row=(id:string,extra:Partial<CostTableRow>={}):CostTableRow=>({id,item:id,group:'Build',category:'Cloud',estimated:100,actual:80,currency:'USD',date:'2026-10-01',notes:null,sourceRef:null,confidence:null,sourceId:source,sourceName:'Costs.csv',type:'csv',...extra});
const rows=[row('Cloud hosting'),row('AI API',{group:'Test',category:'AI API',estimated:200,actual:250,date:'2026-10-03',sourceId:null,type:'manual',sourceName:null}),row('Refund',{estimated:0,actual:-10,date:null}),row('Euro',{currency:'EUR',actual:999})];
describe('shareable dashboard filters',()=>{
  it('validates query values and ignores invalid dates, ranges and oversized strings',()=>{
    expect(readDashboardFilters(new URLSearchParams('by=source&source='+source+'&category=Cloud&from=2026-10-01&to=2026-10-31')).filters).toEqual({by:'source',source,category:'Cloud',from:'2026-10-01',to:'2026-10-31'});
    for(const query of ['by=bad','source=../admin','from=2026-02-30','to=nope','category='+ 'x'.repeat(81),'focus='+'x'.repeat(257)]) expect(readDashboardFilters(new URLSearchParams(query)).invalid).toHaveLength(1);
    const invalid=readDashboardFilters(new URLSearchParams('from=2026-10-31&to=2026-10-01'));
    expect(invalid.filters).toEqual({by:'category'});expect(invalid.invalid).toContain('date range');
  });
  it('combines source/category/group/date/search with inclusive date boundaries',()=>{
    expect(filterDashboardRows(rows,{by:'group',source,category:'Cloud',group:'Build',from:'2026-10-01',to:'2026-10-01',q:'CLOUD'}).map(row=>row.id)).toEqual(['Cloud hosting']);
    expect(filterDashboardRows(rows,{by:'group',source:'manual'}).map(row=>row.id)).toEqual(['AI API']);
    expect(filterDashboardRows(rows,{by:'group',from:'2026-10-01'}).some(row=>row.id==='Refund')).toBe(false);
    expect(filterDashboardRows(rows,{by:'group',category:'Unknown'})).toEqual([]);
  });
  it('changes/removes only owned query keys and safely round-trips column labels',()=>{
    const old=new URLSearchParams('keep=yes&category=Cloud&focus=Build');
    const next=updateDashboardQuery(old,{category:'Tools & API + =',focus:undefined,by:'category'});
    expect(next.get('keep')).toBe('yes');expect(next.has('focus')).toBe(false);expect(readDashboardFilters(next).filters.category).toBe('Tools & API + =');expect(old.get('category')).toBe('Cloud');
  });
});
describe('dashboard consistency and currency safety',()=>{
  it('uses calc totals/summaries, retains foreign-currency rows in the table and reports exclusions',()=>{
    const model=dashboardModel(rows,'USD',{by:'category'});
    expect(model.totals).toMatchObject({estimated:300,actual:320,variance:20,variancePct:expect.closeTo(6.6666666667,8),itemCount:3,overCount:1});
    expect(model.tableRows).toHaveLength(4);expect(model.otherCurrencyCount).toBe(1);
    expect(model.summaries.find(group=>group.key==='Cloud')).toMatchObject({estimated:100,actual:70,variance:-30,count:2});
    expect(model.shareTotal).toBe(320);
  });
  it('chart focus narrows only the table; changing ordinary filters affects every aggregate',()=>{
    const focused=dashboardModel(rows,'USD',{by:'group',focus:'Test'});
    expect(focused.tableRows.map(row=>row.id)).toEqual(['AI API']);expect(focused.totals.itemCount).toBe(3);expect(focused.summaries).toHaveLength(2);
    const filtered=dashboardModel(rows,'USD',{by:'group',category:'AI API'});
    expect(filtered.rows).toHaveLength(1);expect(filtered.totals).toMatchObject({estimated:200,actual:250,variance:50,variancePct:25});
    expect(dashboardModel(rows,'USD',{by:'group',focus:'missing'}).tableRows).toEqual([]);
  });
  it('handles empty data, zero/negative shares and metadata keys',()=>{
    expect(dashboardModel([],'USD',{by:'category'}).totals.itemCount).toBe(0);
    expect(dashboardModel([row('Credit',{actual:-1})],'USD',{by:'category'}).shareTotal).toBe(0);
    expect(summaryKey(row('x',{sourceId:null,type:'manual',sourceName:null}),'source')).toBe('Manual');
    expect(summaryKey(row('x',{date:null}),'month')).toBe('Undated');
  });
});
describe('grouped cumulative chart data',()=>{
  it('aligns sparse dates and carries balances forward without recomputing cumulative arithmetic',()=>{
    const series=burnSeries(rows.filter(row=>row.currency==='USD'),'group',key=>key);
    const aligned=alignBurnSeries(series);
    expect(series.map(group=>group.key)).toEqual(['Test','Build']);
    expect(aligned).toEqual([{date:'2026-10-01',s0Estimated:0,s0Actual:0,s1Estimated:100,s1Actual:80},{date:'2026-10-03',s0Estimated:200,s0Actual:250,s1Estimated:100,s1Actual:80}]);
  });
  it('keeps generated chart keys distinct from user-supplied group labels',()=>{
    const input=[row('Reserved',{group:'__remaining_groups__',actual:100}),...Array.from({length:5},(_,index)=>row(String(index),{group:'G'+index,actual:index+1}))];
    const series=burnSeries(input,'group',key=>key);
    expect(new Set(series.map(group=>group.key)).size).toBe(series.length);
  });
  it('preserves overflow keys in an Other series and hides undated lines',()=>{
    const input=Array.from({length:7},(_,index)=>row(String(index),{group:'Group '+index,actual:index+1}));
    const series=burnSeries(input,'group',key=>key);
    expect(series).toHaveLength(5);expect(series[4].label).toBe('Other 3 groups');
    expect(series[4].points[0]).toMatchObject({cumEstimated:300,cumActual:6});
    expect(burnSeries([row('No date',{date:null})],'month',key=>key)).toEqual([]);expect(alignBurnSeries([])).toEqual([]);
  });
});
