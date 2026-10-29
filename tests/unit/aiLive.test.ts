import{describe,expect,it,vi}from'vitest';
import{createClient}from'@supabase/supabase-js';
import{randomBytes,randomUUID}from'node:crypto';
import {readFileSync} from 'node:fs';
import {summariseProject} from '@/lib/ai/tasks/summarise';
import {extractCosts} from '@/lib/ai/tasks/extractCosts';
import {z} from 'zod';
const state=vi.hoisted(()=>({client:undefined as unknown}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>state.client}));
import{callClaude,resolveModel}from'@/lib/ai/client';
import{aiCacheKey}from'@/lib/ai/cacheKey';
import{AI_TEST_SYSTEM,aiTestSchema}from'@/lib/ai/testTask';
const enabled=process.env.COSTLENS_LIVE_AI==='1'&&Boolean(process.env.GEMINI_API_KEY)&&process.env.COSTLENS_REQUIRE_LIVE_RLS==='1';
describe.skipIf(!enabled)('real Gemini opt-in smoke check',()=>{
  it('gets real validated JSON once, then serves the identical request from cache',async()=>{
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;expect(['localhost','127.0.0.1']).toContain(new URL(url).hostname);
    const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options),client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
    const email=`costlens-live-ai-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const uid=created.data.user!.id;
    const content='CostLens live check '+randomUUID(),model=resolveModel('test','fast');
    const hash=aiCacheKey('test',model,{userId:uid,projectId:null,system:AI_TEST_SYSTEM,content,schema:JSON.stringify(z.toJSONSchema(aiTestSchema)),maxTokens:128,mask:true});
    try{
      expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();state.client=client;
      const task={task:'test' as const,system:AI_TEST_SYSTEM,userContent:content,schema:aiTestSchema,maxTokens:128,model:'fast'};
      expect(await callClaude(task)).toMatchObject({data:{ok:true},cached:false});expect(await callClaude(task)).toMatchObject({data:{ok:true},cached:true,inputTokens:0,outputTokens:0});
    }finally{await admin.from('ai_cache').delete().eq('hash',hash);expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
  },70000);
  it.skipIf(process.env.COSTLENS_LIVE_VISION!=='1')('extracts the real synthetic receipt image using the smart model and shared CostRow schema',async()=>{
    const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,options),client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
    const email=`costlens-live-receipt-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url'),created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const uid=created.data.user!.id;
    try{
      expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();state.client=client;
      expect((await client.from('user_preferences').upsert({user_id:uid,mask_personal_data:false})).error).toBeNull();
      const project=await client.from('projects').insert({owner_id:uid,name:'Live synthetic receipt'}).select('id').single();expect(project.error).toBeNull();
      const rows=await extractCosts({projectId:project.data!.id,media:[{mimeType:'image/jpeg',sourceRef:'image 1',data:readFileSync('tests/fixtures/receipt.jpg')}]});
      expect(rows).toHaveLength(2);expect(rows.map(row=>row.actual).sort((a,b)=>a!-b!)).toEqual([22.5,25]);expect(rows.every(row=>row.estimated===null&&row.sourceRef?.startsWith('image 1'))).toBe(true);
    }finally{expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
  },70000);

  it('explains a real planted cost outlier with a schema-validated 150–200 word summary',async()=>{
    const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,options),client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
    const email=`costlens-live-summary-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url'),created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const uid=created.data.user!.id;
    try{
      expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();state.client=client;
      const project=await client.from('projects').insert({owner_id:uid,name:'Live CodeAudit summary'}).select('id').single();expect(project.error).toBeNull();const id=project.data!.id;
      const inserted=await client.from('cost_items').insert(Array.from({length:6},(_,n)=>({project_id:id,item:n===5?'AI API':'Normal item '+n,grp:'Build',category:'Tools',estimated:100,actual:n===5?900:100,currency:'USD'}))).select('id,item');expect(inserted.error).toBeNull();const flagged=inserted.data!.find(row=>row.item==='AI API')!.id;
      const result=await summariseProject(id);expect(result.data.summary.split(/\s+/).length).toBeGreaterThanOrEqual(150);expect(result.data.summary.split(/\s+/).length).toBeLessThanOrEqual(200);expect(result.data.anomalies.map(row=>row.rowId)).toContain(flagged);expect(result.cached).toBe(false);expect((await summariseProject(id)).cached).toBe(true);
    }finally{expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
  },70000);

});
