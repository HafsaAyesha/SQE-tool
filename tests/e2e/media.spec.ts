import {test,expect} from './fixtures';
import {createClient} from '@supabase/supabase-js';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {z} from 'zod';
import {aiCacheKey} from '../../lib/ai/cacheKey';
import {MEDIA_EXTRACTION_SYSTEM} from '../../lib/ai/extractionPrompt';
import {extractedCostsSchema} from '../../lib/ai/schemas';
import {signMedia} from '../../shared/mediaProtocol';
import {timestampRef,MEDIA_BUCKET} from '../../shared/media';

test('direct recording uploads, live job progress, timestamp playback, confirmed rows and storage cleanup',async({page})=>{
 test.skip(process.env.COSTLENS_LOCAL_AUTH_E2E!=='1','Requires local Storage/Realtime/Redis');test.setTimeout(120000);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options),client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
 expect(['localhost','127.0.0.1']).toContain(new URL(url).hostname);
 const email=`costlens-media-ui-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url'),created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const uid=created.data.user!.id,paths:string[]=[];
 try{
  expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();const project=await client.from('projects').insert({owner_id:uid,name:'Recording review',currency:'USD'}).select('id').single();expect(project.error).toBeNull();const id=project.data!.id,fixture=JSON.parse(readFileSync('tests/fixtures/codeaudit-media-transcript.json','utf8'));
  const model=process.env.GEMINI_MODEL_SMART||'gemini-flash-lite-latest',content=JSON.stringify({defaultCurrency:'USD',transcript:fixture.segments.map((part:{start:number;text:string})=>({sourceRef:timestampRef(part.start),text:part.text})),frames:[]});
  const hash=aiCacheKey('extraction',model,{userId:uid,projectId:id,system:MEDIA_EXTRACTION_SYSTEM,content,schema:JSON.stringify(z.toJSONSchema(extractedCostsSchema)),maxTokens:8192,mask:true});expect((await admin.from('ai_cache').upsert({hash,user_id:uid,project_id:id,kind:'extraction',result:fixture.rows})).error).toBeNull();
  async function callback(jobId:string,action:string,payload:Record<string,unknown>={}){const timestamp=Math.floor(Date.now()/1000),body=JSON.stringify({jobId,timestamp,action,...payload});const response=await page.request.post('/api/media/worker',{headers:{'Content-Type':'application/json','x-costlens-signature':signMedia(jobId,timestamp,process.env.WORKER_SECRET!,action,body)},data:body});expect(response.status(),await response.text()).toBe(200);return response;}
  await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page).toHaveURL(/\/projects$/);
  let saved=0;
  for(const name of ['codeaudit-meeting.mp3','codeaudit-screen.mp4']){
   await page.goto(`/projects/${id}/import`);await page.getByLabel('Choose cost data file',{exact:true}).setInputFiles('tests/fixtures/'+name);await expect(page.getByRole('button',{name:'Upload and process recording',exact:true})).toBeDisabled();await page.getByLabel('I agree to send this recording to the speech-to-text provider and review the extracted costs.').check();
   const queued=page.waitForResponse(response=>new URL(response.url()).pathname===`/api/projects/${id}/media/jobs`&&response.request().method()==='POST');await page.getByRole('button',{name:'Upload and process recording',exact:true}).click();const response=await queued;expect(response.status(),await response.text()).toBe(202);const jobId=(await response.json()).jobId;
   const current=await client.from('jobs').select('storage_path').eq('id',jobId).single();paths.push(current.data!.storage_path);
   await callback(jobId,'claim');await callback(jobId,'progress',{progress:45,duration:120.2,fileHash:createHash('sha256').update(readFileSync('tests/fixtures/'+name)).digest('hex')});
   await expect(page.getByRole('region',{name:'Media import'}).getByRole('status')).toContainText('45%');await page.reload();await expect(page.getByRole('region',{name:'Media import'}).getByRole('status')).toContainText('45%');
   await callback(jobId,'extract',{transcript:fixture.segments,frames:[]});await expect(page.getByRole('button',{name:'Review extracted costs',exact:true})).toBeVisible();await page.getByRole('button',{name:'Review extracted costs',exact:true}).click();await page.getByRole('button',{name:'Preview rows',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'8 rows ready, 0 with problems'})).toBeVisible();
   const compare=page.getByRole('complementary',{name:'Original source comparison'});await compare.getByLabel('Compare cost row',{exact:true}).selectOption({label:'Developer tools'});if(test.info().project.name==='desktop')await page.getByRole('button',{name:'Play recording for Developer tools',exact:true}).click();else await compare.getByRole('button',{name:'Play at 00:15',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();const player=page.getByRole('dialog').locator(name.endsWith('.mp4')?'video':'audio');await expect(player).toHaveAttribute('src',/\/object\/sign\/media-uploads\//);await expect.poll(()=>player.evaluate((element:HTMLMediaElement)=>element.currentTime)).toBeGreaterThanOrEqual(14);await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
   expect((await client.from('cost_items').select('id').eq('project_id',id)).data).toHaveLength(saved);await page.getByRole('button',{name:'Save 8 rows',exact:true}).click();await expect(page.getByText('Import complete',{exact:true})).toBeVisible();saved+=8;
   expect((await admin.storage.from(MEDIA_BUCKET).info(current.data!.storage_path)).error).toBeTruthy();expect((await client.from('cost_items').select('id').eq('project_id',id)).data).toHaveLength(saved);
  }
 }finally{await admin.storage.from(MEDIA_BUCKET).remove(paths);expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
});
