import 'server-only';
import {DemoReadOnlyError} from '@/lib/demo/access';
import {z} from 'zod';
import {requireProject} from '@/lib/supabase/requireProject';
import {enforceRateLimit,RateLimitError,RateLimitUnavailableError,type LimitKind} from './rateLimit';
/** Shared owner + distributed-limit boundary for otherwise repetitive read routes. */
export async function withGuard(projectId:string,kind:LimitKind='read'){
 const project=await requireProject(projectId);await enforceRateLimit(kind,project.owner_id);return project;
}
export const jobIdSchema=z.string().uuid();
export async function withAction<T>(work:()=>Promise<T>):Promise<T|{error:string}>{
 try{return await work();}catch(error){
  if(error instanceof DemoReadOnlyError||error instanceof RateLimitError||error instanceof RateLimitUnavailableError)return {error:error.message};
  if(typeof error==='object'&&error&&'digest'in error)throw error;
  console.error('Server action failed',{type:error instanceof Error?error.name:'unknown'});
  return {error:'We could not save this change. Please try again.'};
 }
}
