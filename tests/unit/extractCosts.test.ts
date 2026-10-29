import {beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({ai:vi.fn()}));
vi.mock('server-only',()=>({}));vi.mock('@/lib/ai/client',()=>({callAI:mock.ai}));
import {extractCosts} from '@/lib/ai/tasks/extractCosts';
const row={item:'Unlabelled price',group:null,category:null,estimated:null,actual:null,currency:'USD',date:null,notes:'Ambiguous amount 25',sourceRef:'page 1',confidence:.6};
beforeEach(()=>{mock.ai.mockReset();});
it('uses the smart guarded wrapper, rejects invalid CostRows/references and explains ambiguity',async()=>{
 mock.ai.mockImplementation(async options=>({data:await options.schema.parseAsync([row])}));
 expect(await extractCosts({projectId:'project',segments:[{sourceRef:'page 1',text:'Price 25'}]})).toEqual([row]);
 const request=mock.ai.mock.calls[0][0];expect(request).toMatchObject({task:'extraction',model:'smart',projectId:'project',maxTokens:8192});expect(request.system).toContain('Never invent numbers');expect(request.system).toContain('set BOTH to null');
 for(const invalid of [{...row,confidence:1.1},{...row,sourceRef:'page 99'},{...row,estimated:'25'}])await expect(request.schema.parseAsync([invalid])).rejects.toThrow();
});
it('accepts empty extraction and passes native media only via the gateway media channel',async()=>{
 mock.ai.mockResolvedValue({data:[]});const media=[{sourceRef:'image 1',mimeType:'image/jpeg' as const,data:new Uint8Array([255,216,255])}];expect(await extractCosts({projectId:'project',media})).toEqual([]);expect(mock.ai.mock.calls[0][0].media).toBe(media);
 const segments=[{sourceRef:'page 1',text:'Safe extracted text',thumbnail:'must not enter text prompt'}];await extractCosts({projectId:'project',segments});expect(mock.ai.mock.calls[1][0].userContent).not.toContain('thumbnail');
});
