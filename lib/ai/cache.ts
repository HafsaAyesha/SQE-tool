import 'server-only';
import { aiStore } from './store';
export { aiCacheKey, canonicalJson } from './cacheKey';
export type CacheScope={userId:string;projectId:string|null};
export async function getAiCache(hash:string,signal:AbortSignal,scope:CacheScope){
  let query=aiStore().from('ai_cache').select('result,created_at').eq('hash',hash).eq('user_id',scope.userId).gte('created_at',new Date(Date.now()-7*86400000).toISOString());
  query=scope.projectId?query.eq('project_id',scope.projectId):query.is('project_id',null);
  const {data,error}=await query.abortSignal(signal).maybeSingle();
  if(error){console.error('AI cache read failed',{code:error.code});return null;}
  return data?{data:data.result,createdAt:new Date(data.created_at as string).toISOString()}:null;
}
export async function setAiCache(hash:string,task:string,result:unknown,signal:AbortSignal,scope:CacheScope,generatedAt=new Date().toISOString()){
  const {error}=await aiStore().from('ai_cache').upsert({hash,kind:task,result,user_id:scope.userId,project_id:scope.projectId,created_at:generatedAt},{onConflict:'hash'}).abortSignal(signal);
  if(error)console.error('AI cache write failed',{code:error.code});
}
