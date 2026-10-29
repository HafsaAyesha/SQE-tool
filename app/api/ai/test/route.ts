import { NextResponse } from 'next/server';
import { callAI } from '@/lib/ai/client';
import { AiError } from '@/lib/ai/errors';
import { AI_TEST_CONTENT, AI_TEST_SYSTEM, aiTestSchema } from '@/lib/ai/testTask';
import { rateLimitResponse } from '@/lib/security/rateLimit';
export const runtime='nodejs';
export const maxDuration=60;
export async function POST(){
  try{
    const result=await callAI({task:'test',system:AI_TEST_SYSTEM,userContent:AI_TEST_CONTENT,schema:aiTestSchema,maxTokens:128,model:'fast'});
    return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    const limited=rateLimitResponse(error);if(limited)return limited;
    const status=error instanceof AiError?error.status:503;
    return NextResponse.json({error:error instanceof AiError?error.message:'AI is temporarily unavailable. Please try again later.'},{status,headers:{'Cache-Control':'private, no-store',...(error instanceof AiError&&error.retryAfter?{'Retry-After':String(error.retryAfter)}:{})}});
  }
}
