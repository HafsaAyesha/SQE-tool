'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
export async function setMaskPersonalData(input:unknown){
  const parsed=z.boolean().safeParse(input);if(!parsed.success)return {error:'Choose a valid privacy setting.'};
  try{
    const supabase=await createClient();const {data:{user},error}=await supabase.auth.getUser();
    if(error||!user)return {error:'Please sign in to update your settings.'};
    const result=await supabase.from('user_preferences').upsert({user_id:user.id,mask_personal_data:parsed.data,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if(result.error)return {error:'Your privacy setting could not be saved. Please try again.'};
    revalidatePath('/settings');return {success:true};
  }catch{return {error:'Your privacy setting could not be saved. Please try again.'};}
}
