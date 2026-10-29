import 'server-only';
import {requireProject} from '@/lib/supabase/requireProject';
import {loadCostItems} from '@/lib/projects/data';
import {callAI} from '@/lib/ai/client';
import {summaryData} from '@/lib/ai/summaryData';
import {SUMMARY_SYSTEM,insightSummarySchema,summaryRequestSchema,type SummaryFilters} from '@/lib/ai/summaryPrompt';
import {canonicalJson} from '@/lib/ai/cacheKey';
import {AiError} from '@/lib/ai/errors';
export async function summariseProject(projectId:string,input:{filters?:SummaryFilters;regenerate?:boolean}={},mode:'generate'|'cached'='generate'){
 const request=summaryRequestSchema.parse(input),project=await requireProject(projectId),rows=await loadCostItems(projectId),data=summaryData(rows,project.currency,request.filters);
 if(!data.rowCount)throw new AiError('Add cost items in the project currency, or clear your filters, before generating insights.',400);
 const aliases=new Map(data.payload.flaggedRows.map((row,index)=>[`row_${index+1}`,row.rowId]));
 const payload={...data.payload,flaggedRows:data.payload.flaggedRows.map((row,index)=>({...row,rowId:`row_${index+1}`}))};
 const allowed=new Set(aliases.keys());
 const schema=insightSummarySchema.superRefine((result,ctx)=>{const ids=result.anomalies.map(row=>row.rowId);if(ids.length!==allowed.size||new Set(ids).size!==ids.length||ids.some(id=>!allowed.has(id)))ctx.addIssue({code:'custom',path:['anomalies'],message:'Explain every supplied flagged row once, using only its exact rowId.'});});
 const result=await callAI({task:'summary',projectId,system:SUMMARY_SYSTEM,userContent:canonicalJson(payload),cacheContext:data.dataHash,schema,maxTokens:8192,model:'smart',refresh:request.regenerate,cacheOnly:mode==='cached'});
 return {...result,data:{...result.data,anomalies:result.data.anomalies.map(row=>({...row,rowId:aliases.get(row.rowId)!}))},dataHash:data.dataHash,flags:data.flags,scope:{rowCount:data.rowCount,flaggedCount:data.flags.length,explainedCount:allowed.size,otherCurrencyCount:data.otherCurrencyCount}};
}
