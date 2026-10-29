import {NextResponse} from 'next/server';
import {requireProject} from '@/lib/supabase/requireProject';
import {enforceRateLimit} from '@/lib/security/rateLimit';
import {uploadMediaSchema,mediaMime} from '@/lib/media/schema';
import {mediaStore,mediaPath,newMediaId,requireWorkerConfig} from '@/lib/media/server';
import {MEDIA_BUCKET,type MEDIA_EXTENSIONS} from '@/shared/media';
import {readMediaJson,mediaError} from '@/lib/media/http';
import {ImportError} from '@/lib/import/errors';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const {id}=await params,project=await requireProject(id);await enforceRateLimit('import',project.owner_id);requireWorkerConfig();
  const input=uploadMediaSchema.safeParse(JSON.parse(await readMediaJson(request)));if(!input.success)throw new ImportError(input.error.issues[0].message);
  const extension=input.data.name.toLowerCase().split('.').pop() as typeof MEDIA_EXTENSIONS[number],uploadId=newMediaId(),path=mediaPath(id,uploadId,extension),mime=mediaMime[extension],db=mediaStore();
  const created=await db.from('jobs').insert({id:uploadId,project_id:id,type:['mp4','mov','webm'].includes(extension)?'video':'audio',storage_path:path,file_name:input.data.name,mime_type:mime,expected_size:input.data.size});if(created.error)throw new ImportError('Could not reserve a private media upload. Check migration 0006.',503);
  const signed=await db.storage.from(MEDIA_BUCKET).createSignedUploadUrl(path,{upsert:false});if(signed.error){await db.from('jobs').delete().eq('id',uploadId);throw new ImportError('Could not create a private media upload URL.',503);}
  return NextResponse.json({uploadId,path,mimeType:mime,signedUrl:signed.data.signedUrl,token:signed.data.token},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return mediaError(error);}
}
