import{afterAll,beforeAll,beforeEach,describe,expect,it,vi}from'vitest';
import{createClient}from'@supabase/supabase-js';
import{randomBytes,randomUUID}from'node:crypto';
import{z}from'zod';
const state=vi.hoisted(()=>({client:undefined as unknown,sdk:vi.fn(),hashes:new Set<string>()}));
vi.mock('server-only',()=>({}));
vi.mock('@anthropic-ai/sdk',()=>({default:class{messages={create:state.sdk};}}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>state.client}));
vi.mock('@/lib/ai/cache',async original=>{const actual=await original<typeof import('@/lib/ai/cache')>();return{...actual,getAiCache:async(hash:string,signal:AbortSignal,scope:Parameters<typeof actual.getAiCache>[2])=>{state.hashes.add(hash);return actual.getAiCache(hash,signal,scope);}};});
import{callClaude}from'@/lib/ai/client';
import{monthlyAiUsage}from'@/lib/ai/usage';
import{aiCacheKey}from'@/lib/ai/cache';
import{dailyAiRemaining}from'@/lib/security/rateLimit';
const schema=z.object({total:z.number()}).strict();
const task={task:'summary' as const,system:'Return the total cost.',userContent:'Email alice@example.com. Cost 25 USD.',schema,maxTokens:100};
const enabled=process.env.COSTLENS_REQUIRE_LIVE_RLS==='1'&&Boolean(process.env.UPSTASH_REDIS_REST_URL);
describe.skipIf(!enabled)('AI gateway with real local Supabase and Redis (provider response controlled)',()=>{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;const opts={auth:{persistSession:false,autoRefreshToken:false}};
  const admin=createClient(url||'http://127.0.0.1:54321',process.env.SUPABASE_SERVICE_ROLE_KEY||'synthetic-not-used',opts);
  const makeClient=()=>createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'synthetic-unused',opts);
  const clients:ReturnType<typeof makeClient>[]=[],ids:string[]=[];let projectB:string;
  beforeAll(async()=>{
    expect(['localhost','127.0.0.1']).toContain(new URL(url).hostname);const password=randomBytes(24).toString('base64url');
    for(const label of ['a','b']){const email=`costlens-ai-${randomUUID()}-${label}@example.com`;const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();ids.push(created.data.user!.id);const client=makeClient();expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();clients.push(client);}
    const project=await clients[1].from('projects').insert({owner_id:ids[1],name:'AI ownership'}).select('id').single();expect(project.error).toBeNull();projectB=project.data!.id;
  },30000);
  beforeEach(()=>{state.sdk.mockReset();state.sdk.mockResolvedValue({content:[{type:'text',text:'{"total":25}'}],stop_reason:'end_turn',usage:{input_tokens:10,output_tokens:5}});state.client=clients[0];vi.stubEnv('ANTHROPIC_API_KEY','synthetic-controlled-provider-key');});
  afterAll(async()=>{vi.unstubAllEnvs();if(state.hashes.size)expect((await admin.from('ai_cache').delete().in('hash',[...state.hashes])).error).toBeNull();for(const id of ids)expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();});
  it('returns validated JSON, serves the second request from private cache and records exact usage',async()=>{
    const first=await callClaude(task),second=await callClaude(task);expect(first).toMatchObject({data:{total:25},cached:false,inputTokens:10,outputTokens:5});expect(second).toMatchObject({data:{total:25},cached:true,inputTokens:0,outputTokens:0});expect(state.sdk).toHaveBeenCalledTimes(1);
    expect(state.sdk.mock.calls[0][0].messages[0].content).toContain('[EMAIL]');
    const usage=await clients[0].from('ai_usage').select('cached,input_tokens,output_tokens,user_id').eq('user_id',ids[0]);expect(usage.error).toBeNull();expect(usage.data).toHaveLength(2);expect(usage.data!.filter(row=>row.cached)).toHaveLength(1);expect(await monthlyAiUsage(ids[0])).toEqual({calls:2,tokens:15,cached:1});expect((await dailyAiRemaining(ids[0]))?.remaining).toBe(198);
  });
  it('prevents B reading A usage/cache/preferences and prevents clients forging usage',async()=>{
    expect((await clients[0].from('user_preferences').upsert({user_id:ids[0],mask_personal_data:false})).error).toBeNull();
    expect((await clients[1].from('ai_usage').select('id').eq('user_id',ids[0])).data).toEqual([]);expect((await clients[1].from('user_preferences').select('*').eq('user_id',ids[0])).data).toEqual([]);
    expect((await clients[0].from('ai_usage').insert({user_id:ids[0],task:'test',model:'fake'})).error).toBeTruthy();expect((await clients[0].from('ai_cache').select('*')).error).toBeTruthy();
    const unmasked=await callClaude(task);expect(unmasked.cached).toBe(false);expect(state.sdk.mock.calls[0][0].messages[0].content).toContain('alice@example.com');
    expect((await clients[0].from('user_preferences').upsert({user_id:ids[0],mask_personal_data:true})).error).toBeNull();
  });
  it('rejects another owner’s project before charging quota or using the provider',async()=>{
    await expect(callClaude({...task,projectId:projectB})).rejects.toMatchObject({digest:'NEXT_HTTP_ERROR_FALLBACK;404'});expect(state.sdk).not.toHaveBeenCalled();
  });
  it('counts cache hits and rejects B’s 21st call in ten minutes',async()=>{
    state.client=clients[1];for(let i=0;i<20;i++)expect((await callClaude(task)).cached).toBe(i>0);
    expect(state.sdk).toHaveBeenCalledTimes(1);await expect(callClaude(task)).rejects.toMatchObject({status:429});expect((await dailyAiRemaining(ids[1]))?.remaining).toBe(180);
    const usage=await clients[1].from('ai_usage').select('id,cached').eq('user_id',ids[1]);expect(usage.data).toHaveLength(20);expect(usage.data!.filter(row=>row.cached)).toHaveLength(19);
  },30000);
});
it('cache hashes are stable, framed, and separate task/model/owner inputs',()=>{
  expect(aiCacheKey('task','model',{a:1,b:2})).toBe(aiCacheKey('task','model',{b:2,a:1}));expect(aiCacheKey('ab','c',{})).not.toBe(aiCacheKey('a','bc',{}));expect(aiCacheKey('t','m',{userId:'a'})).not.toBe(aiCacheKey('t','m',{userId:'b'}));
});
