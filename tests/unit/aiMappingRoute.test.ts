import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({project:vi.fn(),suggest:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/requireProject',()=>({requireProject:mocks.project}));
vi.mock('@/lib/ai/tasks/suggestMapping',()=>({suggestAiMapping:mocks.suggest}));
import { POST } from '@/app/api/projects/[id]/import/suggest-mapping/route';
import { RateLimitError } from '@/lib/security/rateLimit';
import { AiError } from '@/lib/ai/errors';
const params={params:Promise.resolve({id:'11111111-1111-4111-8111-111111111111'})};
const input={columns:['Quoted'],sampleRows:[{Quoted:10}]};
const request=(data:unknown=input)=>new Request('http://localhost/api',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
beforeEach(()=>{vi.resetAllMocks();mocks.project.mockResolvedValue({});mocks.suggest.mockResolvedValue({data:{estimated:{column:'Quoted',confidence:.9,reason:'Planned cost'}},cached:false});});
it('authorizes project first and returns a private validated-gateway result',async()=>{
 const result=await POST(request(),params);expect(result.status).toBe(200);expect(result.headers.get('cache-control')).toBe('private, no-store');expect(mocks.project).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');expect(mocks.suggest).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111',input);
});
it('returns 404 before the gateway for another owner’s project',async()=>{mocks.project.mockRejectedValue({digest:'NEXT_HTTP_ERROR_FALLBACK;404'});expect((await POST(request(),params)).status).toBe(404);expect(mocks.suggest).not.toHaveBeenCalled();});
it('rejects malformed, oversized, duplicate-column and six-row samples',async()=>{
 for(const data of [{columns:['A','A'],sampleRows:[]},{columns:['A'],sampleRows:Array(6).fill({A:1})},{columns:['A'],sampleRows:[{A:'x'.repeat(1001)}]}])expect((await POST(request(data),params)).status).toBe(400);
 expect((await POST(request('x'.repeat(1024*1024)),params)).status).toBe(413);expect(mocks.suggest).not.toHaveBeenCalled();
});
it('returns HTTP 429 with Retry-After and safe errors when AI is unavailable',async()=>{
 mocks.suggest.mockRejectedValueOnce(new RateLimitError(42,'ai'));const limited=await POST(request(),params);expect(limited.status).toBe(429);expect(limited.headers.get('retry-after')).toBe('42');
 mocks.suggest.mockRejectedValueOnce(new AiError('AI is not configured.',503));expect((await POST(request(),params)).status).toBe(503);
});
