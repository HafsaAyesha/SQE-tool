import {z} from 'zod';
import {summaryFiltersSchema} from '@/lib/ai/summarySchema';
export const chartIds=['estimated','variance','burn','share'] as const;
export type ReportChart=typeof chartIds[number];
export const chartLabels:Record<ReportChart,string>={estimated:'Estimated vs actual by group',variance:'Variance % by category',burn:'Cumulative costs over time',share:'Actual cost share by category'};
export type ReportOptions={includeAi:boolean;includeAnomalies:boolean;includeTable:boolean;charts:ReportChart[];filters:z.infer<typeof summaryFiltersSchema>};
export function reportOptions(query:URLSearchParams):ReportOptions{
 const toggle=(key:string,fallback:string)=>z.enum(['0','1']).parse(query.get(key)??fallback)==='1';
 const charts=z.array(z.enum(chartIds)).max(4).parse((query.get('charts')??chartIds.join(',')).split(',').filter(Boolean));
 const filters=summaryFiltersSchema.parse(Object.fromEntries(['source','category','group','from','to','q'].flatMap(key=>query.has(key)?[[key,query.get(key)]]:[])));
 return {includeAi:toggle('ai','0'),includeAnomalies:toggle('anomalies','1'),includeTable:toggle('table','1'),charts:[...new Set(charts)],filters};
}
export function reportQuery(options:ReportOptions){const query=new URLSearchParams({ai:options.includeAi?'1':'0',anomalies:options.includeAnomalies?'1':'0',table:options.includeTable?'1':'0',charts:options.charts.join(',')});for(const [key,value] of Object.entries(options.filters))if(value)query.set(key,value);return query;}
