import 'server-only';
import { callAI, type AiMedia } from '@/lib/ai/client';
import { extractedCostsSchema } from '@/lib/ai/schemas';
import { EXTRACTION_SYSTEM,type ExtractionSegment } from '@/lib/ai/extractionPrompt';
export async function extractCosts({projectId,segments=[],media=[],currency='USD'}:{projectId:string;segments?:ExtractionSegment[];media?:AiMedia[];currency?:string}){
  segments=segments.map(({sourceRef,text})=>({sourceRef,text}));
  const references=[...segments.map(segment=>segment.sourceRef),...media.map(part=>part.sourceRef)];
  const schema=extractedCostsSchema.superRefine((rows,ctx)=>{
    for(const [index,row] of rows.entries())if(!references.some(ref=>ref==='page'?/^page [1-9]\d*(?::|$)/.test(row.sourceRef!):row.sourceRef===ref||row.sourceRef!.startsWith(ref+':')))ctx.addIssue({code:'custom',path:[index,'sourceRef'],message:'Use one of the supplied source references.'});
  });
  const result=await callAI({task:'extraction',projectId,system:EXTRACTION_SYSTEM,userContent:JSON.stringify({defaultCurrency:currency,segments,visualSources:media.map(part=>part.sourceRef)}),media,schema,maxTokens:8192,model:'smart'});
  return result.data;
}
