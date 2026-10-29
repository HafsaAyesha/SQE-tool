import {NextResponse} from 'next/server';
import {withGuard,jobIdSchema} from '@/lib/security/guard';
import {createClient} from '@/lib/supabase/server';
import {deleteMediaUpload,mediaStore} from '@/lib/media/server';
import {MEDIA_BUCKET} from '@/shared/media';
import {mediaError} from '@/lib/media/http';
import {ImportError} from '@/lib/import/errors';
type Context={params:Promise<{id:string;jobId:string}>};
export async function GET(_request:Request,{params}:Context){
 try{const {id,jobId}=await params;await withGuard(id);jobIdSchema.parse(jobId);const db=await createClient();const found=await db.from('jobs').select('id,project_id,source_id,type,status,progress,error,result,file_name,file_hash,duration,cleanup_pending,storage_path').eq('id',jobId).eq('project_id',id).single();if(found.error)throw new ImportError('Recording not found.',404);const {storage_path,...job}=found.data;
 let playbackUrl:string|undefined;if(job.status==='needs_review'){const signed=await mediaStore().storage.from(MEDIA_BUCKET).createSignedUrl(storage_path,3600);if(!signed.error)playbackUrl=signed.data.signedUrl;}
 return NextResponse.json({job,playbackUrl},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return mediaError(error);}
}
export async function DELETE(_request:Request,{params}:Context){
 try{const {id,jobId}=await params;await withGuard(id);jobIdSchema.parse(jobId);const db=mediaStore(),found=await db.from('jobs').select('*').eq('id',jobId).eq('project_id',id).single();if(found.error)throw new ImportError('Recording not found.',404);if(found.data.status==='processing')throw new ImportError('Wait for processing to finish before deleting this recording.',409);await deleteMediaUpload(found.data);if(found.data.status!=='done')await db.from('jobs').update({status:'failed',error:'Recording discarded.',result:null}).eq('id',jobId).eq('project_id',id);return NextResponse.json({deleted:true},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return mediaError(error);}
}
