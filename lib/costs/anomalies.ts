import Decimal from 'decimal.js';
import {rowVariance,rowVariancePct,summaryKey,totals,type CalculationRow} from './calc';
export const anomalyRules=['variance_stddev','variance_iqr','group_share','missing_estimate','duplicate'] as const;
export type AnomalyRule=typeof anomalyRules[number];
export type Anomaly={rowId:string;rules:AnomalyRule[];severity:'high'|'medium'};
export type AnomalyRow=CalculationRow&{id:string;item:string};
export const anomalyLabels:Record<AnomalyRule,string>={variance_stddev:'Variance is more than two standard deviations from the mean',variance_iqr:'Variance exceeds the upper IQR fence',group_share:'More than 25% of group actual cost',missing_estimate:'Actual cost has no estimate',duplicate:'Likely duplicate item, amount and date'};
const D=Decimal.clone({precision:40});
function quantile(sorted:number[],fraction:number){const position=(sorted.length-1)*fraction,lower=Math.floor(position),weight=position-lower;return sorted[lower]*(1-weight)+sorted[Math.min(lower+1,sorted.length-1)]*weight;}
/** Rules are review signals, not accusations. Statistical baselines and group
 * totals are separate for each currency. Zero estimates have no percentage. */
export function anomalies(rows:readonly AnomalyRow[]):Anomaly[]{
 const flags=new Map<string,Set<AnomalyRule>>(),currencies=new Map<string,AnomalyRow[]>(),groups=new Map<string,AnomalyRow[]>(),duplicates=new Map<string,string[]>();
 const add=(id:string,rule:AnomalyRule)=>{const rules=flags.get(id)??new Set<AnomalyRule>();rules.add(rule);flags.set(id,rules);};
 for(const row of rows){
  const currency=row.currency??'USD',cohort=currencies.get(currency)??[];cohort.push(row);currencies.set(currency,cohort);
  const group=JSON.stringify([currency,summaryKey(row,'group')]),members=groups.get(group)??[];members.push(row);groups.set(group,members);
  if(row.actual!=null&&row.estimated==null)add(row.id,'missing_estimate');
  const amount=row.actual??row.estimated;if(amount!=null){const key=JSON.stringify([currency,row.item.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/g,' '),new D(amount).toFixed(2),row.date??null]),ids=duplicates.get(key)??[];ids.push(row.id);duplicates.set(key,ids);}
 }
 for(const cohort of currencies.values()){
  const values=cohort.map(row=>({id:row.id,value:rowVariancePct(row)})).filter((row):row is {id:string;value:number}=>row.value!==null);if(!values.length)continue;
  const mean=values.reduce((sum,row)=>sum.plus(row.value),new D(0)).div(values.length),deviation=values.reduce((sum,row)=>sum.plus(new D(row.value).minus(mean).pow(2)),new D(0)).div(values.length).sqrt();
  const sorted=values.map(row=>row.value).sort((a,b)=>a-b),q1=quantile(sorted,.25),q3=quantile(sorted,.75),fence=q3+1.5*(q3-q1);
  for(const row of values){if(!deviation.isZero()&&new D(row.value).minus(mean).abs().gt(deviation.times(2)))add(row.id,'variance_stddev');if(row.value>fence)add(row.id,'variance_iqr');}
 }
 for(const members of groups.values()){const actual=totals(members).actual;if(actual<=0)continue;for(const row of members)if(row.actual!=null&&new D(row.actual).gt(new D(actual).times(.25)))add(row.id,'group_share');}
 for(const ids of duplicates.values())if(ids.length>1)for(const id of ids)add(id,'duplicate');
 return rows.filter(row=>flags.has(row.id)).map(row=>{const rules=anomalyRules.filter(rule=>flags.get(row.id)!.has(rule));return {rowId:row.id,rules,severity:rules.some(rule=>rule!=='group_share')?'high' as const:'medium' as const};});
}
export const detectAnomalies=anomalies;

export function rankAnomalies(flags:readonly Anomaly[],rows:readonly AnomalyRow[]){
 const lookup=new Map(rows.map(row=>[row.id,row]));const impact=(id:string)=>{const row=lookup.get(id);return row?Math.abs(rowVariance(row)??row.actual??0):0;};
 return [...flags].sort((a,b)=>(a.severity==='high'?0:1)-(b.severity==='high'?0:1)||impact(b.rowId)-impact(a.rowId)||a.rowId.localeCompare(b.rowId));
}
