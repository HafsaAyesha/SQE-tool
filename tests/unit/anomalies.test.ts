import {expect,it} from 'vitest';
import {anomalies} from '@/lib/costs/anomalies';
const row=(id:string,estimated:number|null=100,actual:number|null=100,group='Build')=>({id,item:id,estimated,actual,group,currency:'USD',date:'2026-10-01'});
it('flags a planted AI API outlier by population deviation and upper IQR fence',()=>{
 const rows=[...Array.from({length:10},(_,n)=>row('normal-'+n)),row('AI API',100,900)];const flags=anomalies(rows).find(flag=>flag.rowId==='AI API')!;expect(flags.rules).toEqual(expect.arrayContaining(['variance_stddev','variance_iqr','group_share']));expect(flags.severity).toBe('high');
});
it('uses a strict >2 deviation boundary and catches extreme underspend too',()=>{
 const boundary=anomalies([row('a'),row('b'),row('c'),row('d'),row('outlier',100,200)]).find(flag=>flag.rowId==='outlier');expect(boundary?.rules).not.toContain('variance_stddev');
 const underspend=anomalies([...Array.from({length:6},(_,n)=>row(String(n))),row('credit',100,-900)]).find(flag=>flag.rowId==='credit');expect(underspend?.rules).toContain('variance_stddev');expect(underspend?.rules).not.toContain('variance_iqr');
});
it('flags strictly more than 25% of group actual, with decimal-safe group totals',()=>{
 const atBoundary=anomalies([row('a',.1,.1),row('b',.1,.1),row('c',.1,.1),row('d',.1,.1)]);expect(atBoundary).toEqual([]);
 const isolated=anomalies([row('solo',100,100,'Other'),row('normal',100,100)]);expect(isolated.every(flag=>flag.rules.includes('group_share')&&flag.severity==='medium')).toBe(true);
 expect(anomalies([row('refund',10,-10)]).some(flag=>flag.rules.includes('group_share'))).toBe(false);
});
it('handles missing/zero estimates, absent dates, empty inputs and identical percentages',()=>{
 expect(anomalies([])).toEqual([]);const flags=anomalies([row('missing',null,0),row('zero',0,0),row('unknown',100,null)]);expect(flags).toEqual([{rowId:'missing',rules:['missing_estimate'],severity:'high'}]);
 expect(anomalies(Array.from({length:10},(_,n)=>row('r'+n)))).toEqual([]);
});
it('flags every likely duplicate after normalizing item spelling, amount cents and date; currencies stay separate',()=>{
 const a={...row('a',10,10),item:' Cloud   Hosting '},b={...row('b',10,10),item:'cloud hosting'},c={...row('c',10,10),item:'cloud hosting',date:'2026-10-02'},d={...row('d',10,10),item:'cloud hosting',currency:'EUR'};
 const flags=anomalies([a,b,c,d]);expect(flags.find(flag=>flag.rowId==='a')?.rules).toContain('duplicate');expect(flags.find(flag=>flag.rowId==='b')?.rules).toContain('duplicate');expect(flags.find(flag=>flag.rowId==='c')?.rules).not.toContain('duplicate');expect(flags.find(flag=>flag.rowId==='d')?.rules).not.toContain('duplicate');
});
it('does not mix statistical baselines or group totals between currencies',()=>{
 const rows=[...Array.from({length:10},(_,n)=>row('usd'+n)),{...row('eur',1,100000),currency:'EUR'}];expect(anomalies(rows).find(flag=>flag.rowId==='eur')?.rules).toEqual(['group_share']);
});
