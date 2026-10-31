import{test,expect,signIn}from'./fixtures';
import{createClient}from'@supabase/supabase-js';
import{randomBytes,randomUUID}from'node:crypto';
import {z} from 'zod';
import{aiCacheKey}from'../../lib/ai/cacheKey';
import{AI_TEST_CONTENT,AI_TEST_SYSTEM,aiTestSchema}from'../../lib/ai/testTask';

test('AI settings privacy persistence, private cache, usage, 21st-call HTTP 429/toast and import limits',async({page})=>{
  test.skip(process.env.COSTLENS_LOCAL_AUTH_E2E!=='1','Requires local Supabase/Redis');test.setTimeout(120000);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;expect(['localhost','127.0.0.1']).toContain(new URL(url).hostname);
  const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options),client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
  const email=`costlens-ai-settings-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const uid=created.data.user!.id;
  const model=process.env.GEMINI_MODEL_FAST||'gemini-flash-lite-latest';
  const hash=aiCacheKey('test',model,{userId:uid,projectId:null,system:AI_TEST_SYSTEM,content:AI_TEST_CONTENT,schema:JSON.stringify(z.toJSONSchema(aiTestSchema)),maxTokens:128,mask:true});
  try{
    expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();
    expect((await admin.from('ai_usage').insert({user_id:uid,task:'test',model,input_tokens:100,output_tokens:50,latency_ms:20})).error).toBeNull();
    // Controlled cached output avoids any paid provider request; gateway/Redis/audit path stays real.
    expect((await admin.from('ai_cache').upsert({hash,user_id:uid,kind:'test',result:{ok:true,message:'Controlled cache fixture'}})).error).toBeNull();
    await signIn(page,email,password);await page.goto('/settings');
    const mask=page.getByRole('switch',{name:'Mask personal data before sending to AI',exact:true});await expect(mask).toHaveAttribute('aria-checked','true');
    const saved=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/settings');await mask.click();await saved;await expect(mask).toHaveAttribute('aria-checked','false');await page.reload();await expect(mask).toHaveAttribute('aria-checked','false');
    const savedAgain=page.waitForResponse(response=>response.request().method()==='POST'&&new URL(response.url()).pathname==='/settings');await mask.click();await savedAgain;await page.reload();await expect(mask).toHaveAttribute('aria-checked','true');
    const calls=page.getByRole('region',{name:'AI calls this month',exact:true}),tokens=page.getByRole('region',{name:'Tokens this month',exact:true}),quota=page.getByRole('region',{name:'Daily AI quota remaining',exact:true});
    await expect(calls.getByText('1',{exact:true})).toBeVisible();await expect(tokens.getByText('150',{exact:true})).toBeVisible();await expect(quota.getByText('200 of 200',{exact:true})).toBeVisible();
    for(let i=0;i<2;i++){const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/ai/test');await page.getByRole('button',{name:'Check AI connection',exact:true}).click();const result=await response;expect(result.status()).toBe(200);expect((await result.json()).cached).toBe(true);await expect(page.getByRole('status').filter({hasText:'AI check passed — served from cache.'})).toBeVisible();await expect(page.getByRole('button',{name:'Check AI connection',exact:true})).toBeEnabled();}
    for(let i=2;i<20;i++){const response=await page.request.post('/api/ai/test');expect(response.status()).toBe(200);expect((await response.json()).cached).toBe(true);}
    const blocked=await page.request.post('/api/ai/test');expect(blocked.status()).toBe(429);expect(Number(blocked.headers()['retry-after'])).toBeGreaterThan(0);
    // Dismiss real notifications before reusing the button they may temporarily cover on mobile.
    for(let n=0;n<8&&await page.locator('[data-sonner-toast]:not([data-removed=true])').count();n++)await page.locator('[data-sonner-toast][data-front=true]:not([data-removed=true])').getByRole('button',{name:'Close toast',exact:true}).click();
    await page.getByRole('button',{name:'Check AI connection',exact:true}).click();await expect(page.getByRole('main').getByRole('alert')).toContainText('Too many requests');await page.reload();await expect(calls.getByText('21',{exact:true})).toBeVisible();await expect(tokens.getByText('150',{exact:true})).toBeVisible();await expect(quota.getByText('180 of 200',{exact:true})).toBeVisible();
    const project=await client.from('projects').insert({owner_id:uid,name:'Import rate limits'}).select('id').single();expect(project.error).toBeNull();const id=project.data!.id;
    const multipart={file:{name:'rate.csv',mimeType:'text/csv',buffer:Buffer.from('Item,Actual\nCloud,10')}};
    for(let i=0;i<30;i++)expect((await page.request.post(`/api/projects/${id}/import/parse`,{multipart})).status()).toBe(200);
    const importBlocked=await page.request.post(`/api/projects/${id}/import/parse`,{multipart});expect(importBlocked.status()).toBe(429);expect(Number(importBlocked.headers()['retry-after'])).toBeGreaterThan(0);
    await page.goto(`/projects/${id}/import`);await page.getByLabel('Choose cost data file',{exact:true}).setInputFiles({name:'rate.csv',mimeType:'text/csv',buffer:Buffer.from('Item,Actual\nCloud,10')});await expect(page.getByRole('main').getByRole('alert')).toContainText('Too many requests');
  }finally{expect((await admin.from('ai_cache').delete().eq('hash',hash)).error).toBeNull();expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
});

test('login API limits the eleventh request by trusted IP',async({page})=>{
  test.skip(process.env.COSTLENS_LOCAL_AUTH_E2E!=='1','Requires local Supabase/Redis');test.setTimeout(60000);
  const input={mode:'login',email:`costlens-no-account-${randomUUID()}@example.com`,password:'synthetic-test-password'};
  for(let i=0;i<10;i++)expect((await page.request.post('/api/auth/authenticate',{data:input})).status()).toBe(401);
  const blocked=await page.request.post('/api/auth/authenticate',{data:input});expect(blocked.status()).toBe(429);expect(Number(blocked.headers()['retry-after'])).toBeGreaterThan(0);
});
