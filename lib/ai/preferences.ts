import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { AiError } from './errors';
export async function getMaskingPreference(userId:string,signal?:AbortSignal,serviceClient?:Awaited<ReturnType<typeof createClient>>){
  const supabase=serviceClient??await createClient();let query=supabase.from('user_preferences').select('mask_personal_data').eq('user_id',userId);if(signal)query=query.abortSignal(signal);
  const {data,error}=await query.maybeSingle();
  if(error)throw new AiError('Your privacy preference could not be loaded. AI requests are paused until it is available.');
  return data?.mask_personal_data??true;
}
