import { NextResponse } from 'next/server';
import { requireProject } from '@/lib/supabase/requireProject';
import { mappingInputSchema } from '@/lib/ai/schemas';
import { suggestAiMapping } from '@/lib/ai/tasks/suggestMapping';
import { AiError } from '@/lib/ai/errors';
import { rateLimitResponse } from '@/lib/security/rateLimit';
export const runtime='nodejs';
export const maxDuration=60;
const LIMIT=1024*1024;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const headers={'Cache-Control':'private, no-store'};
  const fail=(error:string,status=400)=>NextResponse.json({error},{status,headers});
  try{
    const {id}=await params;await requireProject(id);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return fail('Send column names and sample rows as JSON.');
    if(Number(request.headers.get('content-length'))>LIMIT)return fail('The mapping sample is too large.',413);
    if(!request.body)return fail('No mapping sample was received.');
    const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
    try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>LIMIT){await reader.cancel();return fail('The mapping sample is too large.',413);}chunks.push(part.value);}}finally{reader.releaseLock();}
    let input:unknown;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return fail('The mapping sample is not valid JSON.');}
    const parsed=mappingInputSchema.safeParse(input);if(!parsed.success)return fail('Send unique column names and at most five short sample rows.');
    const result=await suggestAiMapping(id,parsed.data);
    return NextResponse.json(result,{headers});
  }catch(error){
    const limited=rateLimitResponse(error);if(limited)return limited;
    if(typeof error==='object'&&error&&'digest' in error&&error.digest==='NEXT_HTTP_ERROR_FALLBACK;404')return fail('Project not found.',404);
    if(error instanceof AiError)return NextResponse.json({error:error.message},{status:error.status,headers:{...headers,...(error.retryAfter?{'Retry-After':String(error.retryAfter)}:{})}});
    console.error('AI mapping failed',{type:error instanceof Error?error.name:'unknown'});
    return fail('AI mapping is temporarily unavailable. You can still map columns manually.',503);
  }
}
