import { test, expect, signIn } from './fixtures';
import {createClient} from '@supabase/supabase-js';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {z} from 'zod';
import mammoth from 'mammoth';
import {aiCacheKey} from '../../lib/ai/cacheKey';
import {EXTRACTION_SYSTEM} from '../../lib/ai/extractionPrompt';
import {extractedCostsSchema} from '../../lib/ai/schemas';
import {htmlDocument,structuredRows} from '../../lib/import/document';
import {readPdf} from '../../lib/import/pdfDocument';
import {prepareImage} from '../../lib/import/adapters/image';
import {readSlides} from '../../lib/import/slideDocument';
import {readEmail} from '../../lib/import/emailDocument';

test('document fixtures: estimates, extraction, auto mapping, confidence/source comparison and confirmed persistence',async({page})=>{
 test.skip(process.env.COSTLENS_LOCAL_AUTH_E2E!=='1','Requires local Supabase and Redis');test.setTimeout(150000);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;expect(['localhost','127.0.0.1']).toContain(new URL(url).hostname);const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options),client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
 const email=`costlens-docs-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const uid=created.data.user!.id;
 try{
  expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();expect((await client.from('user_preferences').upsert({user_id:uid,mask_personal_data:false})).error).toBeNull();
  const project=await client.from('projects').insert({owner_id:uid,name:'Unstructured CodeAudit',currency:'USD'}).select('id').single();expect(project.error).toBeNull();const id=project.data!.id;
  const cost=(item:string,sourceRef:string,estimated:number|null,actual:number|null)=>({item,sourceRef,estimated,actual,group:null,category:null,currency:'USD',date:null,notes:null,confidence:.65});
  type Media={mimeType:'application/pdf'|'image/jpeg';sourceRef:string;data:Uint8Array};
  async function seed(segments:{sourceRef:string;text:string}[],media:Media[],result:unknown[]){
   const model=process.env.GEMINI_MODEL_SMART||'gemini-flash-lite-latest';const content=JSON.stringify({defaultCurrency:'USD',segments:segments.map(({sourceRef,text})=>({sourceRef,text})),visualSources:media.map(part=>part.sourceRef)});
   const hash=aiCacheKey('extraction',model,{userId:uid,projectId:id,system:EXTRACTION_SYSTEM,content,schema:JSON.stringify(z.toJSONSchema(extractedCostsSchema)),maxTokens:8192,mask:false,...(media.length?{media:media.map(part=>({mimeType:part.mimeType,sourceRef:part.sourceRef,hash:aiCacheKey('media',part.mimeType,Buffer.from(part.data).toString('base64'))}))}:{})});
   expect((await admin.from('ai_cache').upsert({hash,user_id:uid,project_id:id,kind:'extraction',result})).error).toBeNull();
  }
  const docx=readFileSync('tests/fixtures/codeaudit-budget.docx'),doc=htmlDocument((await mammoth.convertToHtml({buffer:docx})).value,'document','USD');
  await seed([{sourceRef:'document: text',text:doc.text}],[],[cost('Accessibility audit','document: text',75,null),cost('Domain registration','document: text',null,40)]);
  const invoice=readFileSync('tests/fixtures/codeaudit-invoice.pdf'),pdf=await readPdf(invoice),invoiceRows=[cost('Cloud hosting','page 1',null,120),cost('Security review','page 1',null,250)];await seed(pdf.pages,[],invoiceRows);
  const scan=readFileSync('tests/fixtures/codeaudit-scan.pdf');await seed([],[{mimeType:'application/pdf',sourceRef:'page',data:scan}],[cost('Domain registration','page 1',null,25),cost('Test cloud credits','page 1',null,22.5)]);
  const image=await prepareImage(readFileSync('tests/fixtures/receipt.jpg'));await seed([],[{mimeType:'image/jpeg',sourceRef:'image 1',data:image.bytes}],[cost('Domain registration','image 1',null,25),cost('Test cloud credits','image 1',null,22.5)]);
  const slides=readSlides(readFileSync('tests/fixtures/budget-slide.pptx'));await seed(slides.map(slide=>({sourceRef:slide.sourceRef,text:[slide.text,...slide.tables.filter((matrix,index)=>!structuredRows(matrix,`${slide.sourceRef}: table ${index+1}`,'USD').length).map(matrix=>matrix.map(row=>row.join('\t')).join('\n'))].join('\n')})),[],[cost('Presentation design','slide 1',90,null)]);
  const mail=await readEmail(readFileSync('tests/fixtures/invoice-email.eml'),'eml');await seed([{sourceRef:'email body',text:mail.text}],[],[cost('Delivery','email body',null,15)]);
  await signIn(page,email,password);
  let savedCount=0;
  for(const [name,count] of [['codeaudit-budget.docx',4],['codeaudit-invoice.pdf',2],['codeaudit-scan.pdf',2],['receipt.jpg',2],['budget-slide.pptx',2],['invoice-email.eml',3]] as const){
   await page.goto(`/projects/${id}/import`);await page.getByLabel('Choose cost data file',{exact:true}).setInputFiles(`tests/fixtures/${name}`);await expect(page.getByRole('region',{name:'AI extraction estimate'})).toBeVisible();
   expect((await client.from('cost_items').select('id').eq('project_id',id)).data).toHaveLength(savedCount);
   const extracted=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/import/parse')&&r.status()!==202);await page.getByRole('button',{name:'Extract costs with AI',exact:true}).click();const result=await extracted;expect(result.status(),await result.text()).toBe(200);
   await page.getByRole('button',{name:'Continue to mapping',exact:true}).click();await expect(page.getByRole('button',{name:'Preview rows',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Ask AI to map columns',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Preview rows',exact:true}).click();
   await expect(page.getByRole('status').filter({hasText:`${count} rows ready, 0 with problems`})).toBeVisible();const compare=page.getByRole('button',{name:/Compare source for/});await expect(compare.first()).toBeVisible();const low=page.locator('tr[title^="Check extracted values"]');expect(await low.count()).toBeGreaterThan(0);
   const selected=await low.first().getByRole('button',{name:/Compare source for/}).getAttribute('aria-label');const panel=page.getByRole('complementary',{name:'Original source comparison'});await expect(panel).toBeVisible();if(test.info().project.name==='mobile'){await panel.getByLabel('Compare cost row',{exact:true}).selectOption({label:selected!.replace('Compare source for ','')});}else{await low.first().getByRole('button',{name:/Compare source for/}).click();}if(name.endsWith('.pdf')||name.endsWith('.jpg'))await expect(panel.getByRole('img')).toBeVisible();else await expect(panel.locator('pre')).toBeVisible();
   await page.getByRole('button',{name:`Save ${count} rows`,exact:true}).click();await expect(page.getByText('Import complete',{exact:true})).toBeVisible();savedCount+=count;
  }
  await page.reload();expect((await client.from('cost_items').select('id').eq('project_id',id)).data).toHaveLength(15);
  const sources=await client.from('data_sources').select('mapping').eq('project_id',id);for(const source of sources.data!){expect(source.mapping.fileHash).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(source.mapping)).not.toContain('thumbnail');}
 }finally{expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
});
