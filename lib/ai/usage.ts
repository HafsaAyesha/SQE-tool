import 'server-only';
import { createClient } from '@/lib/supabase/server';
export async function monthlyAiUsage(userId:string,now=new Date()){
  const from=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString(),to=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1)).toISOString();
  const supabase=await createClient();let calls=0,tokens=0,cached=0;
  for(let offset=0;;){
    const {data,error}=await supabase.from('ai_usage').select('input_tokens,output_tokens,cached').eq('user_id',userId).gte('created_at',from).lt('created_at',to).order('created_at').order('id').range(offset,offset+999);
    if(error)throw new Error('AI usage could not be loaded');
    if(!data?.length)return {calls,tokens,cached};
    for(const row of data){calls++;tokens+=row.input_tokens+row.output_tokens;if(row.cached)cached++;}
    offset+=data.length;
  }
}
