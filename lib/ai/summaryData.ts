import {createHash} from 'node:crypto';
import {canonicalJson} from './cacheKey';
import {anomalies,rankAnomalies} from '@/lib/costs/anomalies';
import {totals,summarise,rowVariance,rowVariancePct} from '@/lib/costs/calc';
import {filterDashboardRows} from '@/lib/costs/dashboard';
import type {CostTableRow} from '@/lib/costs/types';
import type {SummaryFilters} from './summaryPrompt';
export function summaryData(rows:readonly CostTableRow[],currency:string,filters:SummaryFilters={}){
 const dataHash=createHash('sha256').update(canonicalJson([...rows].sort((a,b)=>a.id.localeCompare(b.id)))).digest('hex');
 const filtered=filterDashboardRows(rows,{...filters,by:'category'}),monetary=filtered.filter(row=>row.currency===currency),flags=anomalies(monetary),byId=new Map(monetary.map(row=>[row.id,row]));
 const selected=rankAnomalies(flags,monetary).slice(0,40);
 return {dataHash,flags,payload:{currency,totals:totals(monetary),byGroup:summarise(monetary,'group'),byCategory:summarise(monetary,'category'),flaggedCount:flags.length,omittedCount:flags.length-selected.length,flaggedRows:selected.map(flag=>{const row=byId.get(flag.rowId)!;return {...flag,item:row.item,group:row.group,category:row.category,estimated:row.estimated,actual:row.actual,variance:rowVariance(row),variancePct:rowVariancePct(row),currency:row.currency,date:row.date,notes:row.notes?.slice(0,500)??null,source:row.sourceName??row.type,sourceRef:row.sourceRef};})},rowCount:monetary.length,otherCurrencyCount:filtered.length-monetary.length};
}
