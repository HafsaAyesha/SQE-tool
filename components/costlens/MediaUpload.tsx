'use client';
import {useEffect,useRef,useState} from 'react';
import {toast} from 'sonner';
import {Clapperboard,LoaderCircle} from 'lucide-react';
import {createClient} from '@/lib/supabase/browser';
import {mediaJobSchema,type MediaJob} from '@/lib/media/schema';
import {fields} from '@/lib/import/mapping';
import {extractedCostsSchema} from '@/lib/ai/schemas';
import type {ParseResponse} from '@/lib/import/schema';
import {MEDIA_BYTES} from '@/shared/media';
import {Button} from '@/components/ui/button';
import {Progress} from '@/components/ui/progress';
export function MediaUpload({projectId,file,onReview,onPendingChange}:{projectId:string;file:File|null;onReview:(table:ParseResponse)=>void;onPendingChange:(busy:boolean)=>void}){
 const [jobId,setJobId]=useState<string|null>(null),[job,setJob]=useState<MediaJob|null>(null),[upload,setUpload]=useState(0),[busy,setBusy]=useState(false),[consent,setConsent]=useState(false),[error,setError]=useState('');
 const [playback,setPlayback]=useState<string|undefined>(),xhr=useRef<XMLHttpRequest|null>(null),key=`costlens:media:${projectId}`;
 useEffect(()=>{setJobId(localStorage.getItem(key));},[key]);
 useEffect(()=>{if(file){setConsent(false);setError('');setJob(null);setJobId(null);}},[file]);
 useEffect(()=>{
  if(!jobId)return;let active=true;
  async function refresh(){try{const response=await fetch(`/api/projects/${projectId}/media/jobs/${jobId}`);const data=await response.json();if(!response.ok)throw new Error(data.error);if(active){setJob(mediaJobSchema.parse(data.job));setPlayback(data.playbackUrl);}}catch(cause){if(active)setError(cause instanceof Error?cause.message:'Could not check recording progress.');}}
  void refresh();const timer=setInterval(()=>void refresh(),3000);let remove=()=>{};
  try{const db=createClient(),channel=db.channel(`media:${jobId}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'jobs',filter:`id=eq.${jobId}`},()=>void refresh()).subscribe();remove=()=>{void db.removeChannel(channel);};}catch{/* Polling remains active when Realtime is unavailable. */}
  return()=>{active=false;clearInterval(timer);remove();};
 },[jobId,projectId]);
 useEffect(()=>()=>xhr.current?.abort(),[]);
 async function start(){
  if(!file||!consent)return;if(file.size>MEDIA_BYTES){setError('Recordings must be 500 MB or smaller.');return;}
  setBusy(true);onPendingChange(true);setError('');setUpload(0);
  try{
   const reserved=await fetch(`/api/projects/${projectId}/media/upload-url`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:file.name,size:file.size})}),data=await reserved.json();if(!reserved.ok)throw new Error(data.error);
   await new Promise<void>((resolve,reject)=>{const request=new XMLHttpRequest();xhr.current=request;request.open('PUT',data.signedUrl);request.setRequestHeader('Content-Type',data.mimeType);request.setRequestHeader('x-upsert','false');request.upload.onprogress=event=>{if(event.lengthComputable)setUpload(Math.round(event.loaded/event.total*100));};request.onload=()=>request.status>=200&&request.status<300?resolve():reject(new Error('The private upload failed. Please upload the recording again.'));request.onerror=()=>reject(new Error('The recording upload lost its connection.'));request.onabort=()=>reject(new Error('Recording upload cancelled.'));request.send(file);});
   const queued=await fetch(`/api/projects/${projectId}/media/jobs`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uploadId:data.uploadId,consentTranscription:true})}),result=await queued.json();if(!queued.ok)throw new Error(result.error);setJobId(result.jobId);localStorage.setItem(key,result.jobId);toast.success(result.dispatchPending?'Recording queued. The worker will pick it up shortly.':'Recording queued for processing.');
  }catch(cause){const message=cause instanceof Error?cause.message:'Media upload failed.';setError(message);toast.error(message);}finally{setBusy(false);onPendingChange(false);xhr.current=null;}
 }
 function review(){
  if(!job||job.status!=='needs_review')return;
  try{const rows=extractedCostsSchema.parse(job.result);onReview({columns:[...fields],rows:rows.map(row=>({...row})),totalCount:rows.length,previewLimit:200,sourceId:job.source_id??undefined,meta:{sourceType:job.type,fileName:job.file_name,fileHash:job.file_hash??undefined,ai:true,warnings:[],mediaJobId:job.id,playbackUrl:playback,mediaType:job.type}});}catch{setError('The extracted rows could not be validated. Try processing the recording again.');}
 }
 async function cleanup(){if(!jobId)return;try{const response=await fetch(`/api/projects/${projectId}/media/jobs/${jobId}`,{method:'DELETE'});const result=await response.json();if(!response.ok)throw new Error(result.error);localStorage.removeItem(key);setJobId(null);setJob(null);toast.success('Private recording deleted.');}catch(cause){setError(cause instanceof Error?cause.message:'Recording deletion failed.');}}
 if(!file&&!jobId)return null;
 return <section aria-label="Media import" className="space-y-4 rounded-2xl border bg-card p-5"><h2 className="flex items-center gap-2 text-lg font-semibold"><Clapperboard className="size-5"/>Import a recording</h2>{file&&!jobId&&<><p className="break-all text-sm">{file.name} · {(file.size/1024/1024).toFixed(1)} MB</p><p className="text-sm text-muted-foreground">Up to 500 MB and 30 minutes. Uploads go directly to private storage. The worker checks the real format and duration. With privacy masking on, the transcript is masked before cost extraction and video frames are omitted.</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={event=>setConsent(event.target.checked)}/>I agree to send this recording to the speech-to-text provider and review the extracted costs.</label><Button disabled={busy||!consent} onClick={start}>{busy?<LoaderCircle className="animate-spin"/>:null}{busy?'Uploading recording…':'Upload and process recording'}</Button>{busy&&<><Progress value={upload} aria-label="Recording upload progress"/><p role="status">Uploading: {upload}%</p><Button variant="outline" onClick={()=>xhr.current?.abort()}>Cancel upload</Button></>}</>}{job&&<><p className="break-all font-medium">{job.file_name}</p><Progress value={job.progress} aria-label="Media processing progress"/><p role="status">{job.status.replace('_',' ')} · {job.progress}%</p>{job.status==='queued'&&<p className="text-sm text-muted-foreground">Waiting for the media worker. You can leave and return to this project.</p>}{job.error&&<p role="alert" className="text-sm text-over">{job.error}</p>}{job.status==='needs_review'&&<Button onClick={review}>Review extracted costs</Button>}{job.status==='done'&&<p className="text-sm">Costs saved. {job.cleanup_pending?'Private recording deletion is pending.':'The private recording has been deleted.'}</p>}{!['queued','processing'].includes(job.status)&&<Button variant="outline" onClick={cleanup}>{job.status==='done'?'Finish recording cleanup':'Discard recording'}</Button>}</>}{error&&<p role="alert" className="text-sm text-over">{error}</p>}</section>;
}
