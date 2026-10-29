import {totals,summarise,cumulativeByDate,rowVariance,rowVariancePct,status} from '@/lib/costs/calc';
import {anomalies} from '@/lib/costs/anomalies';
import {filterDashboardRows} from '@/lib/costs/dashboard';
import type {CostTableRow} from '@/lib/costs/types';
import type {InsightSummary} from '@/lib/ai/summarySchema';
import type {ReportOptions} from './options';
export function reportModel(input:{name:string;currency:string;ownerEmail:string;rows:CostTableRow[];options:ReportOptions;generatedAt?:string;ai?:InsightSummary;aiGeneratedAt?:string}){
 const filtered=filterDashboardRows(input.rows,{...input.options.filters,by:'category'}),monetary=filtered.filter(row=>row.currency===input.currency);
 return {...input,generatedAt:input.generatedAt??new Date().toISOString(),rows:filtered,monetaryRows:monetary,totals:totals(monetary),groups:summarise(monetary,'group'),categories:summarise(monetary,'category'),cumulative:cumulativeByDate(monetary),flags:anomalies(monetary),otherCurrencyCount:filtered.length-monetary.length,sources:[...new Set(filtered.map(row=>row.sourceName??(row.sourceId===null?'Manual':row.type)))].sort(),computed:filtered.map(row=>({...row,variance:rowVariance(row),variancePct:rowVariancePct(row),status:status(row)}))};
}
export type ReportModel=ReturnType<typeof reportModel>;
