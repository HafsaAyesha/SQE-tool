import {createHash} from 'node:crypto';
import {mkdtemp,rm,open,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {z} from 'zod';
import {MEDIA_BYTES} from '../../shared/media.js';
import {request,readBoundedJson,type WorkerConfig} from './config.js';
import {appCall,WorkerFailure} from './api.js';
import {probeMedia,splitAudio,extractFrames} from './ffmpeg.js';
const claimedSchema=z.object({job:z.object({id:z.string().uuid(),projectId:z.string().uuid(),type:z.enum(['audio','video']),expectedSize:z.number().positive().max(MEDIA_BYTES),mimeType:z.string(),downloadUrl:z.string().url(),mask:z.boolean(),currency:z.string()}).nullable()});
export async function downloadMedia(url:string,path:string,expected:number){
 const response=await request(url,{signal:AbortSignal.timeout(180000)});if(!response.ok||!response.body)throw new WorkerFailure('The private recording could not be downloaded.');
 if(Number(response.headers.get('content-length'))>MEDIA_BYTES)throw new WorkerFailure('Recording exceeds 500 MB.');
 const file=await open(path,'wx',0o600),reader=response.body.getReader(),hash=createHash('sha256');let bytes=0;
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>MEDIA_BYTES||bytes>expected){await reader.cancel();throw new WorkerFailure('Recording size exceeds its reservation.');}hash.update(part.value);await file.writeFile(part.value);}if(bytes!==expected)throw new WorkerFailure('Recording size does not match the completed upload.');return hash.digest('hex');}finally{reader.releaseLock();await file.close();}
}
const transcriptSchema=z.object({segments:z.array(z.object({start:z.number().finite().nonnegative(),end:z.number().finite().nonnegative(),text:z.string().max(10000)})).max(5000)});
export async function transcribeChunk(path:string,index:number,duration:number,key:string){
 const bytes=await readFile(path);if(bytes.length>25*1024*1024)throw new WorkerFailure('A speech chunk exceeds 25 MB.');
 const body=new FormData();body.set('model','whisper-1');body.set('response_format','verbose_json');body.set('timestamp_granularities[]','segment');body.set('file',new Blob([Uint8Array.from(bytes)],{type:'audio/wav'}),'chunk.wav');
 const response=await request('https://api.openai.com/v1/audio/transcriptions',{method:'POST',signal:AbortSignal.timeout(120000),headers:{Authorization:`Bearer ${key}`},body});if(!response.ok){await response.body?.cancel();throw new WorkerFailure('Speech transcription is unavailable. Check the speech provider configuration.');}
 const payload=transcriptSchema.parse(await readBoundedJson(response));return payload.segments.map(segment=>({start:index*600+segment.start,end:Math.min(duration,index*600+segment.end),text:segment.text.trim()})).filter(segment=>segment.text&&segment.start<=segment.end&&segment.end<=duration);
}
export async function processJob(config:WorkerConfig,jobId:string){
 let directory:string|undefined;
 try{
  const {job}=claimedSchema.parse(await appCall(config,jobId,'claim'));if(!job)return;
  directory=await mkdtemp(join(tmpdir(),'costlens-'));const path=join(directory,'recording');
  const hash=await downloadMedia(job.downloadUrl,path,job.expectedSize),probe=await probeMedia(path,job.mimeType);
  await appCall(config,jobId,'progress',{progress:15,duration:probe.duration,fileHash:hash});
  const transcript:{start:number;end:number;text:string}[]=[];
  if(probe.hasAudio){const chunks=await splitAudio(path,directory,probe.format);if(chunks.length>3)throw new WorkerFailure('Too many audio chunks.');for(const [index,chunk] of chunks.entries()){transcript.push(...await transcribeChunk(chunk,index,probe.duration,config.openaiKey));await appCall(config,jobId,'progress',{progress:20+Math.round((index+1)/chunks.length*35)});}}
  if(Buffer.byteLength(JSON.stringify(transcript))>500000)throw new WorkerFailure('Transcript is too large. Split the recording.');
  const frames=probe.hasVideo&&!job.mask?await extractFrames(path,directory,probe.format,probe.duration):[];
  await appCall(config,jobId,'progress',{progress:75});if(!transcript.length&&!frames.length)throw new WorkerFailure('No usable speech or permitted video frames were found.');
  await appCall(config,jobId,'extract',{transcript,frames});
 }catch(error){console.error('Media processing failed',{jobId,errorType:error instanceof Error?error.name:'unknown'});try{await appCall(config,jobId,'fail');}catch{/* Polling later handles failed/expired leases. */}}
 finally{if(directory)await rm(directory,{recursive:true,force:true});}
}
