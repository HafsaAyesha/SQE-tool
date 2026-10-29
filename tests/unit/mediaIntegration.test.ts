import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const state=vi.hoisted(()=>({client:undefined as unknown,provider:vi.fn()}));
vi.mock('server-only',()=>({}));vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>state.client}));
vi.mock('@/lib/media/server',async original=>({...await original<typeof import('@/lib/media/server')>(),dispatchMediaJob:vi.fn()}));
const realFetch=globalThis.fetch;
vi.stubGlobal('fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>String(input).startsWith('https://generativelanguage.googleapis.com/')?Response.json(await state.provider(JSON.parse(init!.body as string))):realFetch(input,init));
import {POST as uploadUrl} from '@/app/api/projects/[id]/media/upload-url/route';
import {POST as startJob} from '@/app/api/projects/[id]/media/jobs/route';
import {GET as getJob} from '@/app/api/projects/[id]/media/jobs/[jobId]/route';
import {POST as workerCallback} from '@/app/api/media/worker/route';
import {POST as commit} from '@/app/api/projects/[id]/import/commit/route';
import {signMedia} from '@/shared/mediaProtocol';
import {MEDIA_BUCKET} from '@/shared/media';
import {fields} from '@/lib/import/mapping';
const enabled=process.env.COSTLENS_REQUIRE_LIVE_RLS==='1';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL??'http://127.0.0.1:54321',opts={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY??'synthetic',opts);
const makeClient=()=>createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??'synthetic',opts);
const users:string[]=[],clients:ReturnType<typeof makeClient>[]=[],paths:string[]=[];let projectId:string;
const secret='synthetic-worker-secret-at-least-32-characters';
const fixture=JSON.parse(readFileSync('tests/fixtures/codeaudit-media-transcript.json','utf8'));
const json=(payload:unknown)=>new Request('http://localhost/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
async function callback(jobId:string,action:string,payload:Record<string,unknown>={}){const timestamp=Math.floor(Date.now()/1000),body=JSON.stringify({jobId,action,timestamp,...payload});return workerCallback(new Request('http://localhost/worker',{method:'POST',headers:{'Content-Type':'application/json','x-costlens-signature':signMedia(jobId,timestamp,secret,action,body)},body}));}
beforeAll(async()=>{if(!enabled)return;expect(['127.0.0.1','localhost']).toContain(new URL(url).hostname);vi.stubEnv('WORKER_SECRET',secret);vi.stubEnv('WORKER_URL','http://127.0.0.1:9999');vi.stubEnv('GEMINI_API_KEY','synthetic-controlled-provider');
 const password=randomBytes(24).toString('base64url');for(let n=0;n<2;n++){const email=`costlens-media-${randomUUID()}@example.com`,created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();users.push(created.data.user!.id);const client=makeClient();expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();clients.push(client);}
 state.client=clients[0];const created=await clients[0].from('projects').insert({owner_id:users[0],name:'Media lifecycle'}).select('id').single();expect(created.error).toBeNull();projectId=created.data!.id;
 state.provider.mockResolvedValue({candidates:[{content:{parts:[{text:JSON.stringify(fixture.rows)}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:400, candidatesTokenCount:300}});
},30000);
afterAll(async()=>{if(enabled){await admin.storage.from(MEDIA_BUCKET).remove(paths);for(const id of users)await admin.auth.admin.deleteUser(id);}vi.unstubAllEnvs();});
it.skipIf(!enabled)('direct uploads → signed job callbacks → reviewed rows → idempotent commit → storage deletion for both fixtures',async()=>{
 for(const name of ['codeaudit-meeting.mp3','codeaudit-screen.mp4']){
  state.client=clients[0];const bytes=readFileSync('tests/fixtures/'+name),params={params:Promise.resolve({id:projectId})};const reservation=await uploadUrl(json({name,size:bytes.length}),params);expect(reservation.status,await reservation.clone().text()).toBe(200);const data=await reservation.json();paths.push(data.path);
  expect((await clients[0].storage.from(MEDIA_BUCKET).uploadToSignedUrl(data.path,data.token,bytes,{contentType:data.mimeType})).error).toBeNull();
  state.client=clients[1];expect((await getJob(new Request('http://localhost'),{params:Promise.resolve({id:projectId,jobId:data.uploadId})})).status).toBe(404);expect((await clients[1].from('jobs').select('*').eq('id',data.uploadId)).data).toEqual([]);state.client=clients[0];
  const queued=await startJob(json({uploadId:data.uploadId,consentTranscription:true}),params);expect(queued.status,await queued.clone().text()).toBe(202);
  const claimed=await callback(data.uploadId,'claim');expect(claimed.status,await claimed.clone().text()).toBe(200);expect((await claimed.json()).job.mask).toBe(true);expect((await (await callback(data.uploadId,'claim')).json()).job).toBeNull();
  const hash=createHash('sha256').update(bytes).digest('hex');expect((await callback(data.uploadId,'progress',{progress:70,duration:120.2,fileHash:hash})).status).toBe(200);
  const extracted=await callback(data.uploadId,'extract',{transcript:fixture.segments,frames:[]});expect(extracted.status,await extracted.clone().text()).toBe(200);
  const ready=await getJob(new Request('http://localhost'),{params:Promise.resolve({id:projectId,jobId:data.uploadId})});const review=await ready.json();expect(review.job.status).toBe('needs_review');expect(review.playbackUrl).toContain('/object/sign/media-uploads/');expect(review.job.result).toHaveLength(8);
  const body={source:{id:review.job.source_id,type:review.job.type,name},columns:fields,mapping:Object.fromEntries(fields.map(field=>[field,field])),currency:'USD',mode:'append',rows:review.job.result,mediaJobId:data.uploadId};
  for(let n=0;n<2;n++){const saved=await commit(json(body),params);expect(saved.status,await saved.clone().text()).toBe(200);expect((await saved.json()).cleanupPending).toBe(false);}
  const rows=await clients[0].from('cost_items').select('id,source_ref').eq('source_id',review.job.source_id);expect(rows.data).toHaveLength(8);expect(rows.data![7].source_ref).toBe('01:45');
  expect((await admin.storage.from(MEDIA_BUCKET).info(data.path)).error).toBeTruthy();const job=await clients[0].from('jobs').select('status,result,cleanup_pending').eq('id',data.uploadId).single();expect(job.data).toEqual({status:'done',result:null,cleanup_pending:false});
  expect((await clients[0].storage.from(MEDIA_BUCKET).uploadToSignedUrl(data.path,data.token,bytes,{contentType:data.mimeType})).error).toBeTruthy();
 }
},60000);
it.skipIf(!enabled)('rejects unsigned and tampered callbacks before accessing a job',async()=>{
 const jobId=randomUUID(),timestamp=Math.floor(Date.now()/1000),body=JSON.stringify({jobId,timestamp,action:'claim'});const response=await workerCallback(new Request('http://localhost/worker',{method:'POST',headers:{'Content-Type':'application/json','x-costlens-signature':signMedia(jobId,timestamp,secret,'claim',body+'tamper')},body}));expect(response.status).toBe(401);
});
