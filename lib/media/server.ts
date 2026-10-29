import 'server-only';
import {randomUUID} from 'node:crypto';
import {aiStore} from '@/lib/ai/store';
import {signMedia} from '@/shared/mediaProtocol';
import {MEDIA_BUCKET,MEDIA_EXTENSIONS} from '@/shared/media';
import {ImportError} from '@/lib/import/errors';
import {ProxyAgent} from 'undici';
export const mediaStore=aiStore;
export function requireWorkerConfig(){
 const endpoint=process.env.WORKER_URL,secret=process.env.WORKER_SECRET;
 if(!endpoint||!secret||secret.length<32)throw new ImportError('Media processing is not configured yet. Ask your administrator to configure the worker.',503);
 const url=new URL(endpoint);if(url.username||url.password||url.search||url.hash||url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new ImportError('The media worker configuration is invalid.',503);
 return {url,secret};
}
export function mediaPath(projectId:string,id:string,extension:string){if(!MEDIA_EXTENSIONS.includes(extension as typeof MEDIA_EXTENSIONS[number]))throw new ImportError('Unsupported media extension.');return `${projectId}/${id}.${extension}`;}
export function validMediaPath(path:string,projectId:string,jobId:string){return MEDIA_EXTENSIONS.some(ext=>path===mediaPath(projectId,jobId,ext));}
export async function dispatchMediaJob(jobId:string){
 const {url,secret}=requireWorkerConfig(),timestamp=Math.floor(Date.now()/1000),body=JSON.stringify({jobId,timestamp});url.pathname=url.pathname.replace(/\/$/,'')+'/jobs';
 const proxyUrl=process.env.HTTPS_PROXY||process.env.https_proxy||process.env.HTTP_PROXY||process.env.http_proxy;
 const proxy=proxyUrl&&!['127.0.0.1','localhost'].includes(url.hostname)?new ProxyAgent(proxyUrl):undefined;
 try{const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json','x-costlens-signature':signMedia(jobId,timestamp,secret)},body,...(proxy?{dispatcher:proxy}:{})} as RequestInit);await response.body?.cancel();if(!response.ok)throw new Error('Worker rejected job');}
 finally{void proxy?.destroy();}
}
export async function deleteMediaUpload(job:{id:string;project_id:string;storage_path:string}){
 if(!validMediaPath(job.storage_path,job.project_id,job.id))throw new Error('Invalid media storage path');
 const db=mediaStore();const removed=await db.storage.from(MEDIA_BUCKET).remove([job.storage_path]);if(removed.error)throw new Error('Media cleanup failed');
 const updated=await db.from('jobs').update({cleanup_pending:false}).eq('id',job.id).eq('project_id',job.project_id);if(updated.error)throw new Error('Media cleanup status failed');
}
export function newMediaId(){return randomUUID();}
export async function cleanupProjectMedia(projectId:string){
 const db=mediaStore();
 for(;;){const result=await db.from('jobs').select('id,project_id,storage_path').eq('project_id',projectId).eq('cleanup_pending',true).limit(100);if(result.error)throw new Error('Media cleanup lookup failed');if(!result.data.length)return;
  if(result.data.some(job=>!validMediaPath(job.storage_path,projectId,job.id)))throw new Error('Invalid media path');
  const ids=result.data.map(job=>job.id);const closed=await db.from('jobs').update({status:'failed',error:'Project deleted.',result:null}).in('id',ids).neq('status','done');if(closed.error)throw new Error('Media reservation cleanup failed');
  const removed=await db.storage.from(MEDIA_BUCKET).remove(result.data.map(job=>job.storage_path));if(removed.error)throw new Error('Media cleanup failed');const updated=await db.from('jobs').update({cleanup_pending:false}).in('id',ids).eq('project_id',projectId);if(updated.error)throw new Error('Media cleanup status failed');
 }
}
