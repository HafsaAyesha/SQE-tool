import {test,expect} from './fixtures';
import {createClient} from '@supabase/supabase-js';
import {randomBytes,randomUUID} from 'node:crypto';
import {zodToJsonSchema} from 'zod-to-json-schema';
import {aiCacheKey} from '../../lib/ai/cacheKey';
import {aiMappingSchema,mappingSample} from '../../lib/ai/schemas';
import {MAPPING_SYSTEM,mappingContent} from '../../lib/ai/mappingPrompt';

test('one-click AI mapping of odd headers, reasons, confirmation, import and saved-template reuse',async({page})=>{
  test.skip(process.env.COSTLENS_LOCAL_AUTH_E2E!=='1','Requires local Supabase and Redis');test.setTimeout(90000);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;expect(['localhost','127.0.0.1']).toContain(new URL(url).hostname);
  const options={auth:{persistSession:false,autoRefreshToken:false}},admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options),client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
  const email=`costlens-ai-map-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const uid=created.data.user!.id;
  try{
    expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();
    const project=await client.from('projects').insert({owner_id:uid,name:'AI mapped CodeAudit',currency:'USD'}).select('id').single();expect(project.error).toBeNull();const id=project.data!.id;
    const raw={columns:['Deliverable','Quoted','Invoiced'],rows:[{Deliverable:'Authentication',Quoted:'1200',Invoiced:'1350'},{Deliverable:'Import wizard',Quoted:'2000',Invoiced:'1850'},{Deliverable:'Dashboard',Quoted:'1500',Invoiced:'1500'}]};
    const model=process.env.GEMINI_MODEL_FAST||'gemini-flash-lite-latest';
    const hash=aiCacheKey('mapping',model,{userId:uid,projectId:id,system:MAPPING_SYSTEM,content:mappingContent(mappingSample(raw.columns,raw.rows)),schema:JSON.stringify(zodToJsonSchema(aiMappingSchema,{$refStrategy:'none'})),maxTokens:2048,mask:true});
    const result={item:{column:'Deliverable',confidence:.98,reason:'Describes the work delivered.'},estimated:{column:'Quoted',confidence:.96,reason:'Quoted prices represent planned costs.'},actual:{column:'Invoiced',confidence:.97,reason:'Invoiced amounts represent incurred costs.'}};
    // Private seeded cache exercises the actual route/gateway/quota/audit path without paid calls.
    expect((await admin.from('ai_cache').upsert({hash,user_id:uid,project_id:id,kind:'mapping',result})).error).toBeNull();
    await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page).toHaveURL(/\/projects$/);
    async function upload(){await page.goto(`/projects/${id}/import`);await page.getByLabel('Choose cost data file',{exact:true}).setInputFiles('tests/fixtures/codeaudit-ai.csv');await page.getByRole('button',{name:'Continue to mapping',exact:true}).click();await expect(page.getByText('Loading saved mappings…')).not.toBeVisible();}
    await upload();await expect(page.getByRole('button',{name:'Ask AI to map columns',exact:true})).toBeEnabled();const response=page.waitForResponse(r=>new URL(r.url()).pathname.endsWith('/suggest-mapping'));await page.getByRole('button',{name:'Ask AI to map columns',exact:true}).click();const received=await response;expect(received.status(),await received.text()).toBe(200);expect((await received.json()).cached).toBe(true);
    for(const [column,field] of [['Deliverable','Item'],['Quoted','Estimated'],['Invoiced','Actual']])await expect(page.getByRole('combobox',{name:`Map ${column}`,exact:true})).toHaveText(field);
    const reason=page.getByRole('button',{name:'AI reason for Quoted',exact:true});await reason.focus();await expect(page.getByRole('tooltip')).toContainText('Quoted prices represent planned costs.');await reason.blur();
    expect((await client.from('cost_items').select('id').eq('project_id',id)).data).toEqual([]); // AI never commits.
    await page.getByLabel('Save as template',{exact:true}).check();await page.getByLabel('Template name',{exact:true}).fill('AI CodeAudit');
    await page.getByRole('button',{name:'Preview rows',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'3 rows ready, 0 with problems'})).toBeVisible();await page.getByRole('button',{name:'Save 3 rows',exact:true}).click();await expect(page.getByText('Import complete',{exact:true})).toBeVisible();
    const saved=await client.from('cost_items').select('item,estimated,actual').eq('project_id',id).eq('item','Authentication').single();expect(saved.data).toMatchObject({estimated:1200,actual:1350});
    await upload();await expect(page.getByText('Applied saved template: AI CodeAudit',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Ask AI to map columns',exact:true})).toHaveCount(0);await expect(page.getByRole('combobox',{name:'Map Invoiced',exact:true})).toHaveText('Actual');
    const usage=await client.from('ai_usage').select('task,cached').eq('user_id',uid);expect(usage.data).toEqual([{task:'mapping',cached:true}]);
  }finally{expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
});
