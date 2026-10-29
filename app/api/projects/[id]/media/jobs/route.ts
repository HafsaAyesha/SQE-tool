import {assertWritableProject} from '@/lib/demo/access';
import {NextResponse} from 'next/server';
import {requireProject} from '@/lib/supabase/requireProject';
import {createClient} from '@/lib/supabase/server';
import {enforceRateLimit} from '@/lib/security/rateLimit';
import {createMediaJobSchema} from '@/lib/media/schema';
import {mediaStore,dispatchMediaJob,requireWorkerConfig} from '@/lib/media/server';
import {MEDIA_BUCKET} from '@/shared/media';
import {readMediaJson,mediaError} from '@/lib/media/http';
import {ImportError} from '@/lib/import/errors';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {id}=await params,project=await requireProject(id);assertWritableProject(project);await enforceRateLimit('import',project.owner_id);requireWorkerConfig();
  const input=createMediaJobSchema.safeParse(JSON.parse(await readMediaJson(request)));if(!input.success)throw new ImportError('Choose an uploaded recording and confirm transcription.');
  const db=mediaStore(),found=await db.from('jobs').select('*').eq('id',input.data.uploadId).eq('project_id',id).single();if(found.error||!found.data)throw new ImportError('Recording not found.',404);const job=found.data;
  if(job.status!=='queued')return NextResponse.json({jobId:job.id},{headers:{'Cache-Control':'private, no-store'}});
  if(!job.upload_complete){
   const info=await db.storage.from(MEDIA_BUCKET).info(job.storage_path);if(info.error||!info.data||Number(info.data.size)!==Number(job.expected_size))throw new ImportError('The upload is incomplete or its size changed. Upload the recording again.');
   const userDb=await createClient(),source=await userDb.from('data_sources').insert({project_id:id,type:job.type,name:job.file_name,status:'processing'}).select('id').single();if(source.error)throw new ImportError('Could not create a media source.',503);
   const updated=await db.from('jobs').update({source_id:source.data.id,upload_complete:true,consent_transcription:true}).eq('id',job.id).eq('upload_complete',false).select('id').maybeSingle();
   if(updated.error||!updated.data){await userDb.from('data_sources').delete().eq('id',source.data.id).eq('project_id',id);if(updated.error)throw new ImportError('Could not queue the recording.',503);}
  }
  let dispatchPending=false;try{await dispatchMediaJob(job.id);}catch{dispatchPending=true;}
  return NextResponse.json({jobId:job.id,dispatchPending},{status:202,headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return mediaError(error);}
}
