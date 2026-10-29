import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {ProxyAgent} from 'undici';
import {marketingWord,marketingReceipt} from '../lib/demo/assets';
import {z} from 'zod';
import {normalizeSupabaseUrl} from '../lib/supabase/url';
import {applyMapping,suggestMapping} from '../lib/import/mapping';
import {parseResponseSchema,costRowSchema,type RawTable} from '../lib/import/schema';
import {fields} from '../lib/import/mapping';
import {insightSummarySchema} from '../lib/ai/summarySchema';
import {DEMO_PROJECTS,DEMO_TAG,DEMO_FIXTURES,MARKETING_COSTS,demoCodeAuditCsv,confirmDemoAmounts,seedConfigSchema} from '../lib/demo/seedPlan';

async function main(){
const dry=process.argv.includes('--dry-run');
for(const name of DEMO_FIXTURES)readFileSync(`tests/fixtures/${name}`);
if(dry){console.log({projects:DEMO_PROJECTS,codeAuditSources:['CSV','MS Project XML','PDF invoice','actual meeting recording pipeline'],marketingSources:['generated Word table','generated receipt image'],mode:'dry run; no accounts, uploads or external AI calls created'});process.exit(0);}
const parsed=seedConfigSchema.safeParse({url:process.env.APP_URL,supabaseUrl:normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)??undefined,anon:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service:process.env.SUPABASE_SERVICE_ROLE_KEY,email:process.env.DEMO_EMAIL??'demo@costlens.example',password:process.env.DEMO_PASSWORD,workerUrl:process.env.WORKER_URL});
if(!parsed.success){console.error('Missing or invalid seed configuration:',parsed.error.issues.map(issue=>issue.path.join('.')).join(', '));process.exit(1);}
const config={...parsed.data,url:new URL(parsed.data.url).origin,supabaseUrl:new URL(parsed.data.supabaseUrl).origin,workerUrl:new URL(parsed.data.workerUrl).origin},proxyValue=process.env.HTTPS_PROXY||process.env.HTTP_PROXY,proxy=proxyValue?new ProxyAgent(proxyValue):undefined;
const network:typeof fetch=(input,init={})=>{const hostname=new URL(typeof input==='string'||input instanceof URL?input:input.url).hostname;return fetch(input,{...init,redirect:'error',signal:init.signal??AbortSignal.timeout(90000),...(proxy&&!['localhost','127.0.0.1'].includes(hostname)?{dispatcher:proxy}:{})} as RequestInit);};
const admin=createClient(config.supabaseUrl,config.service,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:network}});
const jar=new Map<string,string>();
const client=createServerClient(config.supabaseUrl,config.anon,{global:{fetch:network},cookies:{getAll:()=>[...jar].map(([name,value])=>({name,value})),setAll:values=>{for(const value of values)jar.set(value.name,value.value);}}});
let createdId:string|undefined,completed=false;
const evidence:{project:string;source:string;rows:number}[]=[];
async function request(path:string,init:RequestInit={}){const response=await network(config.url+path,{...init,headers:{...Object.fromEntries(new Headers(init.headers)),cookie:[...jar].map(([name,value])=>`${name}=${value}`).join('; '),origin:config.url}});if(!response.ok){await response.body?.cancel();throw new Error(`Seed HTTP ${response.status} at ${path.split('?')[0]}. Check the app logs; raw responses/credentials are not printed.`);}return response;}
const post=async(path:string,data:unknown)=>(await request(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})).json();
async function commit(project:string,raw:RawTable,mediaJobId?:string){const mapping=suggestMapping(raw.columns).mapping,result=applyMapping(raw,mapping,{currency:'USD'});if(result.errors.length||!result.rows.length)throw new Error(`Review ${raw.meta.fileName}: mapping/validation is incomplete.`);await post(`/api/projects/${project}/import/commit`,{source:{type:raw.meta.sourceType,name:raw.meta.fileName},mapping,columns:raw.columns,currency:'USD',mode:'append',rows:result.rows,...(raw.meta.fileHash?{fileHash:raw.meta.fileHash}:{}),...(mediaJobId?{mediaJobId}:{})});evidence.push({project,source:raw.meta.fileName,rows:result.rows.length});}
async function importFile(project:string,name:string,bytes:Uint8Array,type:string,expected?:{estimated:number|null;actual:number|null}[]){const form=new FormData();form.set('file',new File([Uint8Array.from(bytes)],name,{type}));form.set('full','true');form.set('extractAi','true');form.set('confirmAi','true');const raw=parseResponseSchema.parse(await (await request(`/api/projects/${project}/import/parse`,{method:'POST',body:form})).json());if(expected){const mapped=applyMapping(raw,suggestMapping(raw.columns).mapping,{currency:'USD'});if(mapped.errors.length)throw new Error('Synthetic source mapping needs review.');confirmDemoAmounts(mapped.rows,expected);}await commit(project,raw);}

async function meeting(project:string){const bytes=readFileSync('tests/fixtures/codeaudit-meeting.mp3'),name='codeaudit-meeting.mp3';const reserved=await post(`/api/projects/${project}/media/upload-url`,{name,size:bytes.length});const upload=await network(reserved.signedUrl,{method:'PUT',headers:{'Content-Type':reserved.mimeType},body:new Uint8Array(bytes)});if(!upload.ok)throw new Error(`Private recording upload failed: HTTP ${upload.status}`);await post(`/api/projects/${project}/media/jobs`,{uploadId:reserved.uploadId,consentTranscription:true});const deadline=Date.now()+20*60*1000;let job;
 while(Date.now()<deadline){job=(await (await request(`/api/projects/${project}/media/jobs/${reserved.uploadId}`)).json()).job;if(job.status==='needs_review')break;if(job.status==='failed')throw new Error('The real recording job failed. Inspect worker/app logs.');await new Promise(resolve=>setTimeout(resolve,5000));}
 if(!job||job.status!=='needs_review')throw new Error('The real recording job did not finish within 20 minutes. No transcript fixture was substituted.');
 const rows=z.array(costRowSchema).parse(job.result),truth=JSON.parse(readFileSync('tests/fixtures/codeaudit-media-transcript.json','utf8'));confirmDemoAmounts(rows,truth.rows);
 await commit(project,{columns:[...fields],rows:rows.map(row=>({...row})),meta:{sourceType:'audio',fileName:name,fileHash:job.file_hash,warnings:[]}},job.id);
 const stored=await admin.from('jobs').select('status,cleanup_pending,storage_path').eq('id',job.id).single();if(stored.error||stored.data.status!=='done'||stored.data.cleanup_pending)throw new Error('Recording cleanup is incomplete. Review the job before publishing the demo.');const object=await admin.storage.from('media-uploads').info(stored.data.storage_path);if(!object.error)throw new Error('Recording remains in private Storage after commit.');
}
try{
 const status=await admin.rpc('production_security_status');if(status.error||!status.data?.demoProtection||!status.data.mediaBucketPrivate||!status.data.tables?.length||status.data.tables.some((table:{rls:boolean})=>!table.rls))throw new Error('Apply all migrations, verify RLS and private media Storage before seeding.');
 const worker=z.object({ok:z.literal(true)}).passthrough().parse(await (await network(config.workerUrl+'/health')).json());void worker;
 const home=await network(config.url);if(!home.ok||!(await home.text()).includes('Try the demo'))throw new Error('Deploy this branch before seeding; the live landing page is not ready.');
 let previous;for(let page=1;;page++){const result=await admin.auth.admin.listUsers({page,perPage:200});if(result.error)throw new Error('Could not inspect the demo account.');previous=result.data.users.find(user=>user.email===config.email);if(previous||result.data.users.length<200)break;}
 if(previous){if(!process.argv.includes('--reset-demo')||previous.app_metadata?.costlens_demo!==true||previous.app_metadata?.demo_seed_tag!==DEMO_TAG)throw new Error('That email already exists. Only an existing marked synthetic demo can be replaced, using --reset-demo. Real accounts are never reset.');const oldProjects=await admin.from('projects').select('id').eq('owner_id',previous.id);if(oldProjects.error)throw new Error('Could not inspect old demo cleanup.');
   if(oldProjects.data.length){const jobs=await admin.from('jobs').select('id,project_id,storage_path,status').in('project_id',oldProjects.data.map(project=>project.id));if(jobs.error||jobs.data.some(job=>job.status==='processing'))throw new Error('Wait for old demo processing to finish before resetting.');for(const job of jobs.data){if(!job.storage_path.startsWith(`${job.project_id}/${job.id}.`))throw new Error('Unsafe old demo path; cleanup stopped.');}if(jobs.data.length&&(await admin.storage.from('media-uploads').remove(jobs.data.map(job=>job.storage_path))).error)throw new Error('Old demo recording cleanup failed; account was preserved.');}
   if((await admin.auth.admin.deleteUser(previous.id)).error)throw new Error('Could not replace the old synthetic demo.');}
 const created=await admin.auth.admin.createUser({email:config.email,password:config.password,email_confirm:true,app_metadata:{costlens_demo:false,demo_seed_tag:DEMO_TAG},user_metadata:{display_name:'CostLens public demo'}});if(created.error||!created.data.user)throw new Error('Could not create the demo user.');createdId=created.data.user.id;
 const signed=await client.auth.signInWithPassword({email:config.email,password:config.password});if(signed.error)throw new Error('Could not sign in to seed the demo.');
 const projects:string[]=[];for(const name of DEMO_PROJECTS){const result=await client.from('projects').insert({owner_id:createdId,name,currency:'USD'}).select('id').single();if(result.error)throw new Error('Could not create a demo project.');projects.push(result.data.id);}
 // Synthetic documents contain no real personal data; visual extraction is explicitly enabled for seeding only.
 if((await client.from('user_preferences').upsert({user_id:createdId,mask_personal_data:false})).error)throw new Error('Could not set synthetic-data extraction preference.');
 await importFile(projects[0],'codeaudit.csv',Buffer.from(demoCodeAuditCsv(readFileSync('tests/fixtures/codeaudit.csv','utf8'))),'text/csv');
 await importFile(projects[0],'codeaudit-msproject.xml',readFileSync('tests/fixtures/codeaudit-msproject.xml'),'application/xml');
 await importFile(projects[0],'codeaudit-invoice.pdf',readFileSync('tests/fixtures/codeaudit-invoice.pdf'),'application/pdf',[{estimated:null,actual:120},{estimated:null,actual:250}]);
 await meeting(projects[0]);
 await importFile(projects[1],'marketing-event-budget.docx',marketingWord(),'application/vnd.openxmlformats-officedocument.wordprocessingml.document',MARKETING_COSTS.map(row=>({estimated:row[3],actual:row[4]})));
 const receipt=await marketingReceipt();
 await importFile(projects[1],'marketing-event-receipt.jpg',receipt,'image/jpeg',[{estimated:null,actual:30},{estimated:null,actual:45}]);
 if((await client.from('user_preferences').upsert({user_id:createdId,mask_personal_data:true})).error)throw new Error('Could not restore privacy defaults.');
 for(const id of projects){const summary=await post(`/api/projects/${id}/ai/summarise`,{});insightSummarySchema.parse(summary.data);if(summary.cached||summary.inputTokens+summary.outputTokens<=0)throw new Error('A real generated summary is required; no canned summary was substituted.');}
 const marked=await admin.auth.admin.updateUserById(createdId,{app_metadata:{costlens_demo:true,demo_seed_tag:DEMO_TAG,demo_project_id:projects[0],demo_seed_complete:true}});if(marked.error)throw new Error('Could not enable read-only demo protection.');
 const denied=await client.from('projects').insert({owner_id:createdId,name:'Must be denied',currency:'USD'});if(!denied.error)throw new Error('Demo write protection failed. Leave DEMO_ENABLED=false.');
 completed=true;mkdirSync('docs',{recursive:true});writeFileSync('docs/demo-seed-results.json',JSON.stringify({run:new Date().toISOString(),runId:randomUUID(),appUrl:config.url,synthetic:true,projects:projects.map((id,index)=>({id,name:DEMO_PROJECTS[index]})),sources:evidence,realMediaPipeline:true,mediaDeletedAfterCommit:true,realSummaries:true,readOnlyVerified:true},null,2)+'\n');console.log(`Demo seeded and locked. CodeAudit: ${config.url}/projects/${projects[0]}. Set DEMO_ENABLED=true in Vercel and redeploy.`);
}catch(error){console.error(error instanceof Error?error.message:'Demo seed failed.');process.exitCode=1;}finally{if(createdId&&!completed){await admin.auth.admin.updateUserById(createdId,{app_metadata:{costlens_demo:true,demo_seed_tag:DEMO_TAG,demo_seed_complete:false}});console.error('Incomplete synthetic demo locked; leave DEMO_ENABLED=false. Fix the reported setup before resetting/reseeding.');}if(proxy)await proxy.close();}

}
main().catch(()=>{console.error('Demo setup failed before completion. No credentials were printed.');process.exitCode=1;});
