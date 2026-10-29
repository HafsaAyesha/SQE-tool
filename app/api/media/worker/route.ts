import {enforceRateLimit} from '@/lib/security/rateLimit';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import sharp from 'sharp';
import {verifyMedia} from '@/shared/mediaProtocol';
import {MEDIA_BUCKET,timestampRef,timestampSeconds} from '@/shared/media';
import {mediaStore,deleteMediaUpload,requireWorkerConfig,validMediaPath} from '@/lib/media/server';
import {readMediaJson,mediaError} from '@/lib/media/http';
import {mediaExtractionSchema} from '@/lib/media/schema';
import {ImportError} from '@/lib/import/errors';
import {callMediaJobAI} from '@/lib/ai/client';
import {getMaskingPreference} from '@/lib/ai/preferences';
import {extractedCostsSchema} from '@/lib/ai/schemas';
import {MEDIA_EXTRACTION_SYSTEM} from '@/lib/ai/extractionPrompt';
export const runtime='nodejs';export const maxDuration=60;
const envelope=z.object({action:z.enum(['claim','progress','extract','fail','poll']),jobId:z.string().uuid(),timestamp:z.number().int()}).passthrough();
export async function POST(request:Request){
 try{
  const raw=await readMediaJson(request,3500000),input=envelope.safeParse(JSON.parse(raw));if(!input.success)throw new ImportError('Invalid worker message.');
  const {jobId,timestamp,action}=input.data,{secret}=requireWorkerConfig();if(!verifyMedia(jobId,timestamp,request.headers.get('x-costlens-signature')??'',secret,action,raw))throw new ImportError('Invalid worker signature or expired timestamp.',401);
  await enforceRateLimit('worker','authenticated-worker');
  const db=mediaStore(),headers={'Cache-Control':'private, no-store'};
  if(action==='poll'){
   const expired=await db.from('jobs').select('*').eq('cleanup_pending',true).or(`expires_at.lt.${new Date().toISOString()},and(status.eq.processing,updated_at.lt.${new Date(Date.now()-30*60*1000).toISOString()}),status.eq.done,status.eq.failed`).limit(20);
   for(const job of expired.data??[]){try{await deleteMediaUpload(job);if(!['done','failed'].includes(job.status))await db.from('jobs').update({status:'failed',error:'This recording expired before review. Upload it again.',result:null}).eq('id',job.id).eq('status',job.status);}catch{/* Retain cleanup_pending for the next sweep. */}}
   const queued=await db.from('jobs').select('id').eq('status','queued').eq('upload_complete',true).gt('expires_at',new Date().toISOString()).order('created_at').limit(10);if(queued.error)throw new Error();return NextResponse.json({jobs:queued.data.map(job=>job.id)},{headers});
  }
  if(action==='claim'){
   const claimed=await db.rpc('claim_media_job',{p_job:jobId});if(claimed.error)throw new Error();const job=claimed.data?.[0];if(!job)return NextResponse.json({job:null},{headers});
   if(!validMediaPath(job.storage_path,job.project_id,job.id))throw new Error('Invalid path');
   const signed=await db.storage.from(MEDIA_BUCKET).createSignedUrl(job.storage_path,3600);if(signed.error)throw new Error();
   const project=await db.from('projects').select('owner_id,currency').eq('id',job.project_id).single();if(project.error)throw new Error();const mask=await getMaskingPreference(project.data.owner_id,undefined,db);
   return NextResponse.json({job:{id:job.id,projectId:job.project_id,type:job.type,expectedSize:job.expected_size,mimeType:job.mime_type,downloadUrl:signed.data.signedUrl,mask,currency:project.data.currency}},{headers});
  }
  const found=await db.from('jobs').select('*').eq('id',jobId).single();if(found.error||found.data.status!=='processing')throw new ImportError('The job is not processing.',409);const job=found.data;
  if(action==='progress'){
   const data=z.object({progress:z.number().int().min(5).max(89),duration:z.number().positive().max(1800).optional(),fileHash:z.string().regex(/^[a-f0-9]{64}$/).optional()}).parse(input.data);
   const updated=await db.from('jobs').update({progress:Math.max(job.progress,data.progress),...(data.duration?{duration:data.duration}:{}),...(data.fileHash?{file_hash:data.fileHash}:{})}).eq('id',jobId).eq('status','processing');if(updated.error)throw new Error();return NextResponse.json({ok:true},{headers});
  }
  if(action==='fail'){
   await db.from('jobs').update({status:'failed',error:'The recording could not be processed. Check its format, duration and provider configuration, then upload it again.',result:null}).eq('id',jobId).eq('status','processing');try{await deleteMediaUpload(job);}catch{}return NextResponse.json({ok:true},{headers});
  }
  const parsed=mediaExtractionSchema.parse({jobId,timestamp,transcript:input.data.transcript,frames:input.data.frames});
  if(!job.duration||!job.file_hash)throw new ImportError('Probe and hash the recording before extraction.');
  if(parsed.transcript.some(part=>part.end<part.start||part.end>job.duration+1)||parsed.frames.some(frame=>frame.seconds>job.duration+1))throw new ImportError('A timestamp is outside the recording.');
  const project=await db.from('projects').select('owner_id,currency').eq('id',job.project_id).single();if(project.error)throw new Error();const mask=await getMaskingPreference(project.data.owner_id,undefined,db);
  const frames=mask?[]:await Promise.all(parsed.frames.map(async frame=>{const bytes=Buffer.from(frame.data,'base64');if(bytes[0]!==255||bytes[1]!==216)throw new ImportError('Frames must be JPEG images.');const image=sharp(bytes,{limitInputPixels:40000000});const normalized=await image.resize({width:768,height:768,fit:'inside',withoutEnlargement:true}).jpeg({quality:60}).toBuffer();return {sourceRef:timestampRef(frame.seconds),mimeType:'image/jpeg' as const,data:normalized};}));
  const schema=extractedCostsSchema.superRefine((rows,ctx)=>{for(const [index,row] of rows.entries()){const seconds=timestampSeconds(row.sourceRef??'');if(seconds===null||seconds>job.duration)ctx.addIssue({code:'custom',path:[index,'sourceRef'],message:'Use mm:ss within the recording duration.'});}});
  const extracted=await callMediaJobAI(jobId,{system:MEDIA_EXTRACTION_SYSTEM,userContent:JSON.stringify({defaultCurrency:project.data.currency,transcript:parsed.transcript.map(part=>({sourceRef:timestampRef(part.start),text:part.text})),frames:frames.map(frame=>frame.sourceRef)}),media:frames,schema,maxTokens:8192});
  if(!extracted.data.length)throw new ImportError('No cost line items were found in this recording.');
  const saved=await db.from('jobs').update({status:'needs_review',progress:100,result:extracted.data,error:null}).eq('id',jobId).eq('status','processing').select('id').single();if(saved.error)throw new Error();await db.from('data_sources').update({status:'needs_review'}).eq('id',job.source_id).eq('project_id',job.project_id);
  return NextResponse.json({status:'needs_review',count:extracted.data.length},{headers});
 }catch(error){return mediaError(error);}
}
