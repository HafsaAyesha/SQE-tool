// Local-only HTTP security checks; reuse the existing Supabase CLI and Redis/Lua helper.
import {execFileSync,spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdirSync,openSync,closeSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {startLocalRedis} from './local-redis.mjs';
const root=new URL('..',import.meta.url),env={...process.env,SUPABASE_HOME:process.env.SUPABASE_HOME||'/workspace/.supabase-cli',SUPABASE_USE_SLIM_IMAGES:'true'};
mkdirSync(new URL('docs',root),{recursive:true});
if(!process.argv.slice(2).length||!existsSync(new URL('docs/security-test-results.md',root)))writeFileSync(new URL('docs/security-test-results.md',root),'# Step 3A security tests\n\n| Test | Input | Expected | Actual | PASS/FAIL |\n| --- | --- | --- | --- | --- |\n| Local HTTP security suite | Fake accounts and existing fixtures | Five scenarios pass | Starting; no success claimed | FAIL |\n');
let app,redis,log;let exitCode=1;
try{
 const status=JSON.parse(execFileSync(fileURLToPath(new URL('node_modules/.bin/supabase',root)),['status','--output','json'],{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 if(!status.API_URL||!status.ANON_KEY||!status.SERVICE_ROLE_KEY||!['localhost','127.0.0.1'].includes(new URL(status.API_URL).hostname))throw new Error('Start the local Supabase stack using docs/supabase.md. Hosted test accounts are not allowed.');
 if(!env.GEMINI_API_KEY)throw new Error('GEMINI_API_KEY is needed for the real prompt-injection check; no model response will be faked.');
 redis=await startLocalRedis();
 const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
 const base=`http://127.0.0.1:${port}`;
 const testEnv={...env,...redis.env,NEXT_PUBLIC_SUPABASE_URL:status.API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:status.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:status.SERVICE_ROLE_KEY,SOURCE_ENCRYPTION_KEY:randomBytes(32).toString('base64'),WORKER_SECRET:randomBytes(32).toString('hex'),WORKER_URL:'http://127.0.0.1:9',COSTLENS_SECURITY_BASE_URL:base,XDG_CACHE_HOME:'/tmp/costlens-cache',NEXT_TELEMETRY_DISABLED:'1',COSTLENS_SECURITY_PARTIAL:process.argv.slice(2).length?'1':'0'};
 mkdirSync('/tmp/costlens-cache',{recursive:true});log=openSync('/tmp/costlens-security-server.log','w',0o600);
 app=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port',String(port)],{cwd:root,env:testEnv,stdio:['ignore',log,log],detached:true});
 let ready=false;const deadline=Date.now()+90000;
 while(Date.now()<deadline){if(app.exitCode!==null)throw new Error('The local dev server stopped. See /tmp/costlens-security-server.log.');try{const res=await fetch(base+'/login',{signal:AbortSignal.timeout(1500)});if(res.ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,500));}
 if(!ready)throw new Error('The local dev server did not become ready. See /tmp/costlens-security-server.log.');
 exitCode=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['node_modules/vitest/vitest.mjs','run','--config','vitest.security.config.ts',...process.argv.slice(2)],{cwd:root,env:testEnv,stdio:'inherit'});child.once('error',reject);child.once('exit',code=>resolve(code??1));});
}catch(error){console.error(error.message);writeFileSync(new URL('docs/security-test-results.md',root),`# Step 3A security tests\n\n| Test | Input | Expected | Actual | PASS/FAIL |\n| --- | --- | --- | --- | --- |\n| Local suite setup | Local Supabase, Redis, Gemini and Next dev | Ready | ${error.message.replaceAll('|','/')} | FAIL |\n`);
}finally{if(app?.pid){try{process.kill(-app.pid,'SIGTERM');}catch{}await new Promise(resolve=>{if(app.exitCode!==null)return resolve();app.once('exit',resolve);setTimeout(resolve,5000).unref();});}if(log!==undefined)closeSync(log);if(redis)await redis.close();}
process.exitCode=exitCode;
