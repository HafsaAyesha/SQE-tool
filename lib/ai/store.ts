import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { AiError } from './errors';
import { normalizeSupabaseUrl } from '@/lib/supabase/url';
export function aiStore(){
  const url=normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new AiError('AI storage is not configured yet. Please try again later.');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export type UsageRecord={user_id:string;project_id:string|null;task:string;model:string;input_tokens:number;output_tokens:number;latency_ms:number;cached:boolean;success:boolean};
export async function recordAiUsage(record:UsageRecord){
  const {error}=await aiStore().from('ai_usage').insert(record).abortSignal(AbortSignal.timeout(4500));
  if(error){console.error('AI usage recording failed',{code:error.code,task:record.task});throw new AiError('AI usage could not be recorded. Please try again later.');}
}
