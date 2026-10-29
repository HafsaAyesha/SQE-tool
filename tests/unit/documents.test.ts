import {beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {zipSync,strToU8} from 'fflate';
import sharp from 'sharp';
import {PDFDocument} from 'pdf-lib';
const state=vi.hoisted(()=>({extract:vi.fn()}));
vi.mock('@/lib/ai/tasks/extractCosts',()=>({extractCosts:state.extract}));
import {getAdapterFor,getAdapter} from '@/lib/import/registry';
import {documentPlan} from '@/lib/import/documentPlan';
import {prepareImage} from '@/lib/import/adapters/image';
import {readPdf} from '@/lib/import/pdfDocument';
import {costRowSchema} from '@/lib/import/schema';
import {applyMapping,suggestMapping} from '@/lib/import/mapping';
const projectId='11111111-1111-4111-8111-111111111111';
const row=(item:string,sourceRef:string,estimated:number|null,actual:number|null)=>({item,sourceRef,estimated,actual,group:null,category:null,currency:'USD',date:null,notes:null,confidence:.65});
beforeEach(()=>{state.extract.mockReset();state.extract.mockImplementation(async(input)=>{
  if(input.media?.length)return [row('Domain registration',input.media[0].mimeType==='application/pdf'?'page 1':'image 1',null,25),row('Test cloud credits',input.media[0].mimeType==='application/pdf'?'page 1':'image 1',null,22.5)];
  const ref=input.segments[0].sourceRef;
  if(ref==='document: text')return [row('Accessibility audit',ref,75,null),row('Domain registration',ref,null,40)];
  if(ref==='slide 1')return [row('Presentation design',ref,90,null)];
  if(ref==='email body')return [row('Delivery',ref,null,15)];
  return [row('Cloud hosting','page 1',null,120),row('Security review','page 1',null,250)];
});});
it.each([['codeaudit-budget.docx','docx',4],['codeaudit-invoice.pdf','pdf',2],['codeaudit-scan.pdf','pdf',2],['receipt.jpg','image',2],['receipt.heic','image',2],['budget-slide.pptx','pptx',2],['invoice-email.eml','email',3],['invoice-email.msg','email',1]])('parses %s into canonical rows and a disposable source preview',async(name,id,count)=>{
  const bytes=readFileSync(`tests/fixtures/${name}`);const file=new File([bytes],String(name));const adapter=await getAdapterFor(file);expect(adapter?.id).toBe(id);expect(adapter?.kind).toBe('ai');
  const plan=await documentPlan(file);expect(plan.units).toBeGreaterThan(0);
  const result=await adapter!.parse(file,{projectId,currency:'USD',confirmAi:true});
  expect(result.rows).toHaveLength(Number(count));for(const item of result.rows)expect(costRowSchema.safeParse(item).success).toBe(true);
  expect(result.meta.fileHash).toMatch(/^[a-f0-9]{64}$/);expect(result.meta.ai).toBe(true);expect(result.meta.previews?.length).toBeGreaterThan(0);
  expect(applyMapping(result,suggestMapping(result.columns).mapping,{currency:'USD'}).errors).toEqual([]);
  if(id==='docx'){expect(result.rows).toContainEqual(expect.objectContaining({item:'Cloud hosting',estimated:100,actual:80,confidence:1}));expect(JSON.stringify(state.extract.mock.calls)).not.toContain('Cloud hosting');}
  if(id==='email'&&String(name).endsWith('.eml'))expect(result.rows.some(row=>String(row.sourceRef).startsWith('attachment 1: page 1'))).toBe(true);
},30000);
it('keeps text-layer PDFs on the text path and uses native document parts for scans or no-cost text',async()=>{
 const text=readFileSync('tests/fixtures/codeaudit-invoice.pdf');await getAdapter('pdf')!.parse(text,{fileName:'invoice.pdf',projectId});expect(state.extract.mock.calls[0][0].segments[0].text).toContain('120.00');expect(state.extract.mock.calls[0][0].media).toBeUndefined();
 state.extract.mockClear();await getAdapter('pdf')!.parse(readFileSync('tests/fixtures/codeaudit-scan.pdf'),{fileName:'scan.pdf',projectId});expect(state.extract.mock.calls[0][0].media[0].mimeType).toBe('application/pdf');
 state.extract.mockReset();state.extract.mockResolvedValueOnce([]).mockResolvedValueOnce([row('Invoice','page 1',null,120)]);await getAdapter('pdf')!.parse(text,{fileName:'invoice.pdf',projectId});expect(state.extract).toHaveBeenCalledTimes(2);expect(state.extract.mock.calls[1][0].media).toBeDefined();
},30000);
it('rejects >20 PDF pages and requires explicit confirmation above five pages before AI',async()=>{
 for(const count of [6,21]){const pdf=await PDFDocument.create();for(let i=0;i<count;i++)pdf.addPage();const bytes=Buffer.from(await pdf.save());if(count===21)await expect(documentPlan(bytes,{fileName:'long.pdf'})).rejects.toThrow(/20 pages/);else {expect((await documentPlan(bytes,{fileName:'six.pdf'})).units).toBe(6);await expect(getAdapter('pdf')!.parse(bytes,{fileName:'six.pdf',projectId})).rejects.toThrow(/Confirm/);}}
 expect(state.extract).not.toHaveBeenCalled();
},30000);
it('rejects huge images before decoding pixels and normalizes orientation/size to JPEG',async()=>{
 const large=await sharp({create:{width:7000,height:6000,channels:3,background:'white'}}).png().toBuffer();await expect(prepareImage(large)).rejects.toThrow(/40 megapixels/);
 const image=await sharp({create:{width:2400,height:600,channels:3,background:'white'}}).webp().toBuffer();const normalized=await prepareImage(image),meta=await sharp(normalized.bytes).metadata();expect(meta.format).toBe('jpeg');expect(meta.width).toBe(2000);expect(meta.height).toBe(500);
});
it('blocks DOCTYPE in Office archives, macro payloads and unknown attachments',async()=>{
 const docx=zipSync({'[Content_Types].xml':strToU8('<Types/>'),'word/document.xml':strToU8('<!DOCTYPE a><a/>')});await expect(getAdapterFor(new File([docx],'evil.docx'))).rejects.toThrow(/DOCTYPE/);
 const macro=zipSync({'[Content_Types].xml':strToU8('<Types/>'),'word/document.xml':strToU8('<a/>'),'word/vbaProject.bin':strToU8('x')});await expect(getAdapterFor(new File([macro],'macro.docx'))).rejects.toThrow(/Macro/);
 const email=Buffer.from('From: test@example.test\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=x\r\n\r\n--x\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename="payload.exe"\r\nContent-Transfer-Encoding: base64\r\n\r\nTVp4eHg=\r\n--x--');await expect(documentPlan(email,{fileName:'bad.eml'})).rejects.toThrow(/Executable/);
});
it('rejects nested attachment traversal beyond one level',async()=>{
 const nested=readFileSync('tests/fixtures/invoice-email.eml').toString('base64');
 const email=Buffer.from(`From: test@example.test\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=x\r\n\r\n--x\r\nContent-Type: message/rfc822\r\nContent-Disposition: attachment; filename="nested.eml"\r\nContent-Transfer-Encoding: base64\r\n\r\n${nested}\r\n--x--`);await expect(documentPlan(email,{fileName:'nested.eml'})).rejects.toThrow(/Nested/);
});
it('extracts actual text and page thumbnails from a PDF without network or disk writes',async()=>{
 const parsed=await readPdf(readFileSync('tests/fixtures/codeaudit-invoice.pdf'),true);expect(parsed.pages[0].text).toContain('Security review');expect(parsed.pages[0].thumbnail).toMatch(/^data:image\/jpeg;base64,/);
});

it('rejects DTDs in PPTX relationship parts and mixed-case inner XML before parsing',async()=>{
 const {zipSync,unzipSync,strToU8}=await import('fflate');
 for(const name of ['ppt/_rels/presentation.xml.rels','ppt/slides/injected.XML']){
  const zip=unzipSync(readFileSync('tests/fixtures/budget-slide.pptx'));
  zip[name]=strToU8('<!DOCTYPE x [<!ENTITY ext SYSTEM "file:///etc/passwd">]><x>&ext;</x>');
  await expect(getAdapter('pptx')!.parse(Buffer.from(zipSync(zip)),{fileName:'budget-slide.pptx',projectId})).rejects.toThrow(/DOCTYPE|entities/);
 }
});
