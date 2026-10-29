'use server';
import {isDemoUser,DEMO_MESSAGE} from '@/lib/demo/access';
import {enforceRateLimit,RateLimitError,RateLimitUnavailableError} from '@/lib/security/rateLimit';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
export async function setMaskPersonalData(input:unknown){
  const parsed=z.boolean().safeParse(input);if(!parsed.success)return {error:'Choose a valid privacy setting.'};
  try{
    const supabase=await createClient();const {data:{user},error}=await supabase.auth.getUser();
    if(error||!user)return {error:'Please sign in to update your settings.'};
    if(isDemoUser(user))return {error:DEMO_MESSAGE};
    await enforceRateLimit('mutation',user.id);
    const result=await supabase.from('user_preferences').upsert({user_id:user.id,mask_personal_data:parsed.data,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if(result.error)return {error:'Your privacy setting could not be saved. Please try again.'};
    revalidatePath('/settings');return {success:true};
  }catch(error){if(error instanceof RateLimitError||error instanceof RateLimitUnavailableError)return {error:error.message};console.error('Privacy setting save failed',{type:error instanceof Error?error.name:'unknown'});return {error:'Your privacy setting could not be saved. Please try again.'};}
}
