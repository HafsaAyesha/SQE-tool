import 'server-only';
import { callAI } from '@/lib/ai/client';
import { MAPPING_SYSTEM, mappingContent } from '@/lib/ai/mappingPrompt';
import { aiMappingSchema, mappingInputSchema, type MappingInput } from '@/lib/ai/schemas';
export async function suggestAiMapping(projectId:string,input:MappingInput){
  const data=mappingInputSchema.parse(input);
  const schema=aiMappingSchema.superRefine((mapping,ctx)=>{
    for(const [field,value] of Object.entries(mapping))if(value&&!data.columns.includes(value.column))ctx.addIssue({code:'custom',path:[field,'column'],message:'Choose an exact source column from the supplied list.'});
    if(!Object.values(mapping).some(Boolean))ctx.addIssue({code:'custom',message:'Suggest at least one supported mapping.'});
  });
  // The gateway hashes task/model plus this canonical column/sample payload after
  // applying privacy preferences. No filename, source id or full table affects reuse.
  return callAI({task:'mapping',system:MAPPING_SYSTEM,userContent:mappingContent(data),schema,maxTokens:2048,model:'fast',projectId});
}
