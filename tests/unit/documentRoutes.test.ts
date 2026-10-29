import {beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
const mock=vi.hoisted(()=>({project:vi.fn(),extract:vi.fn(),fetch:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/requireProject',()=>({requireProject:mock.project}));
vi.mock('@/lib/security/rateLimit',()=>({enforceRateLimit:vi.fn(),rateLimitResponse:()=>null}));
vi.mock('@/lib/ai/tasks/extractCosts',()=>({extractCosts:mock.extract}));
vi.mock('@/lib/security/urlGuard',()=>({safeFetch:mock.fetch}));
import {POST} from '@/app/api/projects/[id]/import/parse/route';
import {POST as fetchSource} from '@/app/api/projects/[id]/import/fetch/route';
const params={params:Promise.resolve({id:'11111111-1111-4111-8111-111111111111'})};
const row={item:'Hosting',group:null,category:null,estimated:100,actual:null,currency:'USD',date:null,notes:null,sourceRef:'document: text',confidence:.8};
function upload(bytes:Buffer,name:string,extract=false,confirm=false){const form=new FormData();form.set('file',new File([Uint8Array.from(bytes)],name));if(extract)form.set('extractAi','true');if(confirm)form.set('confirmAi','true');return new Request('http://localhost/parse',{method:'POST',body:form});}
beforeEach(()=>{vi.resetAllMocks();mock.project.mockResolvedValue({owner_id:'owner',currency:'USD'});mock.extract.mockResolvedValue([row]);});
it('returns an estimate before AI, then extracts after user confirmation with only rows/hash/ephemeral previews',async()=>{
 const bytes=readFileSync('tests/fixtures/codeaudit-budget.docx');const plan=await POST(upload(bytes,'budget.docx'),params);expect(plan.status).toBe(202);expect((await plan.json()).estimate.units).toBe(1);expect(mock.extract).not.toHaveBeenCalled();
 const response=await POST(upload(bytes,'budget.docx',true,true),params);expect(response.status).toBe(200);const data=await response.json();expect(data.meta.fileHash).toMatch(/^[a-f0-9]{64}$/);expect(data.rows).toHaveLength(3);expect(JSON.stringify(data)).not.toContain(bytes.toString('base64'));
});
it('enforces >5 page confirmation server-side and ownership before parsing',async()=>{
 const pdf=await PDFDocument.create();for(let i=0;i<6;i++)pdf.addPage();const bytes=Buffer.from(await pdf.save());expect((await POST(upload(bytes,'six.pdf',true),params)).status).toBe(409);expect(mock.extract).not.toHaveBeenCalled();
 mock.project.mockRejectedValue({digest:'NEXT_HTTP_ERROR_FALLBACK;404'});expect((await POST(upload(Buffer.from('MZ'),'bad.docx'),params)).status).toBe(404);
});
it('falls back from HTML without tables to confirmed readable-text extraction through the guarded URL adapter',async()=>{
 mock.fetch.mockResolvedValue({bytes:Buffer.from('<html><body><script>hidden evil</script><main><h1>Budget</h1><p>Planned hosting costs USD 100.</p></main></body></html>'),contentType:'text/html'});
 const request=(confirmAi=false)=>new Request('http://localhost/fetch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'html',url:'https://example.com/budget',confirmAi})});
 const plan=await fetchSource(request(),params);expect(plan.status).toBe(202);expect(mock.extract).not.toHaveBeenCalled();mock.extract.mockResolvedValue([{...row,sourceRef:'web page'}]);const response=await fetchSource(request(true),params);expect(response.status).toBe(200);expect(JSON.stringify(mock.extract.mock.calls)).not.toContain('hidden evil');expect((await response.json()).meta.ai).toBe(true);
});
