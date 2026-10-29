import { z } from 'zod';
import { fields } from '@/lib/import/mapping';
const suggestion=z.object({column:z.string().min(1).max(256),confidence:z.number().finite().min(0).max(1),reason:z.string().trim().min(1).max(500)}).strict();
export const aiMappingSchema=z.object(Object.fromEntries(fields.map(field=>[field,suggestion.optional()])) as Record<typeof fields[number],z.ZodOptional<typeof suggestion>>).strict().superRefine((mapping,ctx)=>{
  const columns=Object.values(mapping).filter(value=>value!==undefined).map(value=>value.column);
  if(new Set(columns).size!==columns.length)ctx.addIssue({code:'custom',message:'Each source column must map to only one field.'});
});
export type AiMapping=z.infer<typeof aiMappingSchema>;
const cell=z.union([z.string().max(1000),z.number().finite(),z.boolean(),z.null()]);
export const mappingInputSchema=z.object({columns:z.array(z.string().min(1).max(256)).min(1).max(256).refine(columns=>new Set(columns).size===columns.length,'Columns must be unique.'),sampleRows:z.array(z.record(z.string(),cell)).max(5)}).strict().superRefine((input,ctx)=>{
  if(input.sampleRows.some(row=>Object.keys(row).some(column=>!input.columns.includes(column))))ctx.addIssue({code:'custom',message:'Sample cells must use the supplied columns.'});
});
export type MappingInput=z.infer<typeof mappingInputSchema>;
// Pick only the requested columns and five bounded rows; never send a whole import.
export function mappingSample(columns:string[],rows:Record<string,unknown>[]):MappingInput{
  return mappingInputSchema.parse({columns,sampleRows:rows.slice(0,5).map(row=>Object.fromEntries(columns.map(column=>{
    const value=row[column];return [column,value==null?null:typeof value==='number'&&Number.isFinite(value)||typeof value==='boolean'?value:String(value).slice(0,1000)];
  })))});
}
export function needsAiMapping(mapping:Partial<Record<typeof fields[number],string>>,confidence:Partial<Record<typeof fields[number],number>>){
  return (['item','estimated','actual'] as const).some(field=>!mapping[field]||(confidence[field]??0)<0.6);
}

export function mappingFieldConfidence(field:typeof fields[number],mapping:Partial<Record<typeof fields[number],string>>,synonyms:{mapping:Partial<Record<typeof fields[number],string>>;confidence:Partial<Record<typeof fields[number],number>>},ai:AiMapping,confirmed:ReadonlySet<typeof fields[number]>):number{
  if(!mapping[field])return 0;
  if(confirmed.has(field))return 1;
  const value=ai[field];
  if(value&&value.column===mapping[field])return value.confidence;
  return synonyms.mapping[field]===mapping[field]?synonyms.confidence[field]??0:0;
}

import { costRowSchema } from '@/lib/import/schema';
export const extractedCostSchema=costRowSchema.extend({confidence:z.number().finite().min(0).max(1),sourceRef:z.string().min(1).max(512)}).strict();
export const extractedCostsSchema=z.array(extractedCostSchema).max(5000);
