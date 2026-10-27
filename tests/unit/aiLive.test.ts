import{describe,expect,it,vi}from'vitest';
import{createClient}from'@supabase/supabase-js';
import{randomBytes,randomUUID}from'node:crypto';
import{zodToJsonSchema}from'zod-to-json-schema';
const state=vi.hoisted(()=>({client:undefined as unknown}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>state.client}));
import{callClaude,resolveModel}from'@/lib/ai/client';
import{aiCacheKey}from'@/lib/ai/cacheKey';
import{AI_TEST_SYSTEM,aiTestSchema}from'@/lib/ai/testTask';
const enabled=process.env.COSTLENS_LIVE_AI==='1'&&Boolean(process.env.ANTHROPIC_API_KEY)&&process.env.COSTLENS_REQUIRE_LIVE_RLS==='1';
describe.skipIf(!enabled)('real Anthropic opt-in smoke check',()=>{
  it('gets real validated JSON once, then serves the identical request from cache',async()=>{
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;expect(['localhost','127.0.0.1']).toContain(new URL(url).hostname);
    const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options),client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
    const email=`costlens-live-ai-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const uid=created.data.user!.id;
    const content='CostLens live check '+randomUUID(),model=resolveModel('test','fast');
    const hash=aiCacheKey('test',model,{userId:uid,projectId:null,system:AI_TEST_SYSTEM,content,schema:JSON.stringify(zodToJsonSchema(aiTestSchema,{$refStrategy:'none'})),maxTokens:128,mask:true});
    try{
      expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();state.client=client;
      const task={task:'test' as const,system:AI_TEST_SYSTEM,userContent:content,schema:aiTestSchema,maxTokens:128,model:'fast'};
      expect(await callClaude(task)).toMatchObject({data:{ok:true},cached:false});expect(await callClaude(task)).toMatchObject({data:{ok:true},cached:true,inputTokens:0,outputTokens:0});
    }finally{await admin.from('ai_cache').delete().eq('hash',hash);expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
  },70000);
});
