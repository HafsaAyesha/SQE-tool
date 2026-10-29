import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {writeFileSync,readFileSync} from 'node:fs';
import {ProxyAgent} from 'undici';
import {z} from 'zod';
import {DEMO_PROJECTS} from '../lib/demo/seedPlan';
import {normalizeSupabaseUrl} from '../lib/supabase/url';
async function main(){
 const config=z.object({app:z.url(),worker:z.url(),supabase:z.url(),anon:z.string().min(1),service:z.string().min(1)}).safeParse({app:process.env.APP_URL,worker:process.env.WORKER_URL,supabase:normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)??undefined,anon:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,service:process.env.SUPABASE_SERVICE_ROLE_KEY});if(!config.success)throw new Error('Configure APP_URL, WORKER_URL and existing Supabase variables before verification.');
 const raw=config.data;for(const value of [raw.app,raw.worker,raw.supabase]){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Production URLs must be HTTPS origins.');}
 const {anon,service}=raw,app=new URL(raw.app).origin,worker=new URL(raw.worker).origin,supabase=new URL(raw.supabase).origin;
 const proxyValue=process.env.HTTPS_PROXY||process.env.HTTP_PROXY,proxy=proxyValue?new ProxyAgent(proxyValue):undefined;
 const network:typeof fetch=(input,init={})=>fetch(input,{...init,redirect:'manual',signal:init.signal??AbortSignal.timeout(60000),...(proxy?{dispatcher:proxy}:{})} as RequestInit);
 const checks:{check:string;passed:boolean}[]=[];
 try{
  const db=createClient(supabase,service,{auth:{persistSession:false},global:{fetch:network}}),status=await db.rpc('production_security_status');if(status.error)throw new Error('Production security-status RPC unavailable; apply migration 0008.');
  const safe=status.data?.demoProtection&&status.data?.mediaBucketPrivate&&status.data.tables?.length&&status.data.tables.every((row:{rls:boolean})=>row.rls);if(!safe)throw new Error('Production RLS, demo protection or private Storage verification failed.');checks.push({check:'All application tables have RLS; media bucket private; demo protections present',passed:true});
  const authSettings=await network(supabase+'/auth/v1/settings',{headers:{apikey:anon}});if(!authSettings.ok||(await authSettings.json()).mailer_autoconfirm!==false)throw new Error('Enable production email confirmation in Supabase before releasing the demo.');checks.push({check:'Supabase email confirmation enabled',passed:true});
  const health=await network(worker+'/health');if(!health.ok||!(await health.json()).ok)throw new Error('Worker /health did not return ok.');checks.push({check:'Worker health',passed:true});
  const home=await network(app);if(!home.ok||!(await home.text()).includes('Try the demo'))throw new Error('Live home page/demo button missing.');for(const name of ['content-security-policy','strict-transport-security','x-content-type-options'])if(!home.headers.get(name))throw new Error('Production security header missing.');checks.push({check:'Live home page, demo button and security headers',passed:true});
  const login=await network(app+'/api/auth/demo',{method:'POST',headers:{'Content-Type':'application/json',origin:app},body:'{}'});if(!login.ok)throw new Error(`Public demo sign-in failed: HTTP ${login.status}`);const redirect=z.object({redirect:z.string().regex(/^\/projects\/[a-f0-9-]{36}$/)}).parse(await login.json()).redirect;
  const cookies=login.headers.getSetCookie().map(cookie=>cookie.split(';')[0]),page=await network(app+redirect,{headers:{cookie:cookies.join('; ')}});if(!page.ok||!(await page.text()).includes(DEMO_PROJECTS[0]))throw new Error('Demo did not open the CodeAudit dashboard.');checks.push({check:'Try the demo signs in and opens CodeAudit dashboard',passed:true});
  const jar=cookies.map(cookie=>{const i=cookie.indexOf('=');return {name:cookie.slice(0,i),value:cookie.slice(i+1)};}),client=createServerClient(supabase,anon,{global:{fetch:network},cookies:{getAll:()=>jar,setAll:()=>{}}});const user=await client.auth.getUser();if(!user.data.user?.app_metadata.costlens_demo)throw new Error('Public demo session is not protected.');const denied=await client.from('projects').insert({owner_id:user.data.user.id,name:'Must not be created',currency:'USD'});if(!denied.error)throw new Error('Read-only demo write unexpectedly succeeded.');checks.push({check:'Direct Supabase mutation denied for public demo session',passed:true});
  writeFileSync('docs/production-verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),appUrl:app,workerUrl:worker,checks,securityStatus:status.data},null,2)+'\n');const readme=readFileSync('README.md','utf8');writeFileSync('README.md',readme.replace(/<!-- LIVE_URL -->.*?<!-- \/LIVE_URL -->/,`<!-- LIVE_URL -->[Open CostLens](${app})<!-- /LIVE_URL -->`));console.log('Production verified. Evidence: docs/production-verification.json');
 }finally{if(proxy)await proxy.close();}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Production verification failed.');process.exitCode=1;});
