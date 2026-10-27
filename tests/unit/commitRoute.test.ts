import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ requireProject:vi.fn(), rpc:vi.fn(), revalidatePath:vi.fn() }));
vi.mock('@/lib/security/rateLimit',()=>({enforceRateLimit:vi.fn(),rateLimitResponse:()=>null,loginIdentifier:()=> 'test-ip',RateLimitError:class extends Error{},RateLimitUnavailableError:class extends Error{}}));
vi.mock('next/headers',()=>({headers:async()=>new Headers()}));
vi.mock('@/lib/supabase/requireProject', () => ({requireProject:mocks.requireProject}));
vi.mock('@/lib/supabase/server', () => ({createClient:async()=>({rpc:mocks.rpc})}));
vi.mock('next/cache', () => ({revalidatePath:mocks.revalidatePath}));
import { POST } from '@/app/api/projects/[id]/import/commit/route';
const project = '33333333-3333-4333-8333-333333333333';
const ctx = {params:Promise.resolve({id:project})};
const row = {item:'=SUM(A1:A2)',group:null,category:null,estimated:10,actual:9,currency:'USD',date:null,notes:'@literal',sourceRef:null,confidence:null};
const input = {source:{type:'csv',name:'costs.csv'},mapping:{item:'Item'},columns:['Item'],currency:'USD',mode:'append',rows:[row]};
const request = (data:unknown) => new Request(`http://localhost/api/projects/${project}/import/commit`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
beforeEach(()=>{vi.clearAllMocks();mocks.requireProject.mockResolvedValue({id:project});mocks.rpc.mockResolvedValue({data:{sourceId:'44444444-4444-4444-8444-444444444444',count:1},error:null});});
it('uses one transaction RPC, escapes text and keeps numeric credits numeric',async()=>{
  const response=await POST(request({...input,rows:[{...row,actual:-25.5}]}),ctx);
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc.mock.calls[0][1]).toMatchObject({p_project:project,p_rows:[{...row,item:"'=SUM(A1:A2)",notes:"'@literal",actual:-25.5}]});
});
it('revalidates every row, rejecting empty names, invalid numbers, dates and overlong notes',async()=>{
  for(const bad of [{...row,item:''},{...row,actual:'10'},{...row,actual:1.001},{...row,actual:1e12},{...row,date:'2025-02-30'},{...row,notes:'x'.repeat(10000)}]) expect((await POST(request({...input,rows:[row,bad]}),ctx)).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('checks ownership before accepting rows or touching the database',async()=>{
  mocks.requireProject.mockRejectedValue(Object.assign(new Error(),{digest:'NEXT_HTTP_ERROR_FALLBACK;404'}));
  expect((await POST(request(input),ctx)).status).toBe(404);expect(mocks.rpc).not.toHaveBeenCalled();
});
it('requires a source for replace and rejects duplicate field mappings',async()=>{
  for(const bad of [{...input,mode:'replace'},{...input,mapping:{item:'Item',actual:'Item'}},{...input,rows:[]},{...input,columns:['Other']}]) expect((await POST(request(bad),ctx)).status).toBe(400);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('handles failed transactions without reporting success',async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:{code:'42501'}});
  expect((await POST(request(input),ctx)).status).toBe(400);expect(mocks.revalidatePath).not.toHaveBeenCalled();
});
