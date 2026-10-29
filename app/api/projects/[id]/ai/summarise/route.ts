import {NextResponse} from 'next/server';
import {requireProject} from '@/lib/supabase/requireProject';
import {summaryRequestSchema} from '@/lib/ai/summaryPrompt';
import {summariseProject} from '@/lib/ai/tasks/summarise';
import {readMediaJson,mediaError} from '@/lib/media/http';
import {AiError} from '@/lib/ai/errors';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{const {id}=await params;await requireProject(id);const input=summaryRequestSchema.safeParse(JSON.parse(await readMediaJson(request,8192)));if(!input.success)throw new AiError('The insight filters or request are invalid.',400);const result=await summariseProject(id,input.data);return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});}catch(error){return mediaError(error,'Insights are temporarily unavailable. Please try again.');}
}
