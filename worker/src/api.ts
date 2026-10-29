import {signMedia} from '../../shared/mediaProtocol.js';
import {request,readBoundedJson,type WorkerConfig} from './config.js';
export class WorkerFailure extends Error{}
export async function appCall(config:WorkerConfig,jobId:string,action:string,payload:Record<string,unknown>={}){
 const timestamp=Math.floor(Date.now()/1000),body=JSON.stringify({action,jobId,timestamp,...payload});
 const response=await request(new URL('/api/media/worker',config.appUrl),{method:'POST',signal:AbortSignal.timeout(action==='extract'?65000:15000),headers:{'Content-Type':'application/json','x-costlens-signature':signMedia(jobId,timestamp,config.secret,action,body)},body});
 if(!response.ok){await response.body?.cancel();throw new WorkerFailure(`App callback failed (${response.status}).`);}
 return readBoundedJson(response);
}
