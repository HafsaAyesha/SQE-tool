import 'server-only';
import {requireProject} from '@/lib/supabase/requireProject';
import {createClient} from '@/lib/supabase/server';
import {loadCostItems} from '@/lib/projects/data';
import {summariseProject} from '@/lib/ai/tasks/summarise';
import {summaryData} from '@/lib/ai/summaryData';
import {AiError} from '@/lib/ai/errors';
import {reportModel} from './model';
import type {ReportOptions} from './options';
export async function loadReport(projectId:string,options:ReportOptions,withAi=true){
 const project=await requireProject(projectId),db=await createClient(),{data:{user}}=await db.auth.getUser();let rows=await loadCostItems(projectId);let ai,aiGeneratedAt;
 if(rows.length>10000)throw new AiError('This report exceeds 10,000 items. Export a smaller project or filter its source data.',413);
 if(options.includeAi&&withAi){const summary=await summariseProject(projectId,{filters:options.filters},'cached');rows=await loadCostItems(projectId);if(summaryData(rows,project.currency,options.filters).dataHash!==summary.dataHash)throw new AiError('Costs changed while the report was loading. Refresh the preview and try again.',409);ai=summary.data;aiGeneratedAt=summary.generatedAt;}
 return reportModel({name:project.name,currency:project.currency,ownerEmail:user?.email??'Account owner',rows,options,ai,aiGeneratedAt});
}
