import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { applyMapping, suggestMapping } from '../../lib/import/mapping';

test('full import: fixtures, unusual mapping, inline fixes, templates, source replacement and all 501 rows', async ({ page, browser }) => {
  test.skip(process.env.COSTLENS_LOCAL_AUTH_E2E !== '1', 'Requires real local Supabase');
  test.setTimeout(150000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  expect(['localhost','127.0.0.1']).toContain(new URL(url).hostname);
  const options = {auth:{persistSession:false,autoRefreshToken:false}};
  const admin = createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options);
  const client = createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
  const run=randomUUID(),password=randomBytes(24).toString('base64url'),email=`costlens-mapping-${run}@example.com`;
  const ids:string[]=[];
  try {
    const a=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(a.error).toBeNull();ids.push(a.data.user!.id);
    const b=await admin.auth.admin.createUser({email:`costlens-mapping-b-${run}@example.com`,password,email_confirm:true});expect(b.error).toBeNull();ids.push(b.data.user!.id);
    expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();
    const project=await client.from('projects').insert({owner_id:ids[0],name:'Mapping tests',currency:'USD'}).select('id').single();expect(project.error).toBeNull(); const id=project.data!.id;
    await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page).toHaveURL(/\/projects$/);
    // Every structured fixture goes through the real parser, mapper, commit route and database.
    for(const name of ['codeaudit.csv','codeaudit.tsv','codeaudit.xlsx','codeaudit.xls','codeaudit.ods','codeaudit.json','codeaudit.xml','codeaudit-msproject.xml','codeaudit-paste.txt']) {
      const response=await page.request.post(`/api/projects/${id}/import/parse`,{multipart:{file:{name,mimeType:'application/octet-stream',buffer:readFileSync(`tests/fixtures/${name}`)},full:'true',...(name.endsWith('paste.txt')?{adapterId:'paste'}:{})}});
      expect(response.status(),name).toBe(200);const raw=await response.json();
      const mapping=suggestMapping(raw.columns).mapping;const result=applyMapping(raw,mapping,{currency:'USD'});
      expect(result.errors,name).toEqual([]);
      const saved=await page.request.post(`/api/projects/${id}/import/commit`,{data:{source:{type:raw.meta.sourceType,name},mapping,columns:raw.columns,currency:'USD',mode:'append',rows:result.rows}});
      expect(saved.status(),`${name}: ${await saved.text()}`).toBe(200);
    }
    const manual=await client.from('cost_items').insert({project_id:id,item:'Preserve manual',actual:50}).select('id').single();expect(manual.error).toBeNull();
    await page.goto(`/projects/${id}/import`);
    await page.getByLabel('Choose cost data file',{exact:true}).setInputFiles('tests/fixtures/codeaudit-unusual.csv');
    await page.getByRole('button',{name:'Continue to mapping',exact:true}).click();
    await expect(page.getByText('Loading saved mappings…')).not.toBeVisible();
    for(const [column,field] of [['Deliverable title','Item'],['Funding pot','Estimated'],['Outlay','Actual'],['Period begins','Date'],['Remarks','Notes']]) {
      await page.getByRole('combobox',{name:`Map ${column}`,exact:true}).click();await page.getByRole('option',{name:field,exact:true}).click();
    }
    await page.getByLabel('Default currency',{exact:true}).selectOption('EUR');
    await page.getByLabel('Save as template',{exact:true}).check();await page.getByLabel('Template name',{exact:true}).fill('Unusual CodeAudit');
    await page.getByRole('button',{name:'Preview rows',exact:true}).click();
    await expect(page.getByText('2 rows ready, 0 with problems',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Save 2 rows',exact:true}).click();await expect(page.getByRole('heading',{name:'Import complete'})).toBeVisible();
    const unusual=await client.from('data_sources').select('id').eq('project_id',id).eq('name','codeaudit-unusual.csv').single();expect(unusual.error).toBeNull();
    const values=await client.from('cost_items').select('actual,date,currency').eq('source_id',unusual.data!.id).order('actual');
    expect(values.data).toEqual([{actual:-20,date:'2024-01-02',currency:'EUR'},{actual:1100,date:'2024-01-01',currency:'EUR'}]);
    // Same type/columns automatically applies the saved template; replace retains other sources/manual rows.
    await page.goto(`/projects/${id}/import`);await page.getByLabel('Choose cost data file',{exact:true}).setInputFiles('tests/fixtures/codeaudit-unusual.csv');await page.getByRole('button',{name:'Continue to mapping',exact:true}).click();
    await expect(page.getByText('Applied saved template: Unusual CodeAudit',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Preview rows',exact:true}).click();
    await page.getByLabel('Replace existing rows from this source',{exact:true}).check();await page.getByRole('button',{name:'Save 2 rows',exact:true}).click();await expect(page.getByRole('heading',{name:'Import complete'})).toBeVisible();
    expect((await client.from('cost_items').select('id').eq('source_id',unusual.data!.id)).data).toHaveLength(2);
    expect((await client.from('cost_items').select('id').eq('id',manual.data!.id)).data).toHaveLength(1);
    // Bad cells are outlined and editable; a corrected row can be saved, another skipped.
    await page.goto(`/projects/${id}/import`);await page.getByLabel('Choose cost data file',{exact:true}).setInputFiles({name:'problems.csv',mimeType:'text/csv',buffer:Buffer.from('Item,Actual\n=literal,12\n,broken\nBad date,nope')});
    await page.getByRole('button',{name:'Continue to mapping',exact:true}).click();await page.getByRole('button',{name:'Preview rows',exact:true}).click();
    await expect(page.getByText('1 rows ready, 2 with problems',{exact:true})).toBeVisible();
    await expect(page.locator('td[data-invalid=true]').first()).toBeVisible();
    await page.getByLabel('Fix row 2 Item',{exact:true}).fill('Corrected');await page.getByLabel('Fix row 2 Actual',{exact:true}).fill('25.50');
    await page.getByRole('button',{name:'Apply fixes',exact:true}).click();await expect(page.getByText('2 rows ready, 1 with problems',{exact:true})).toBeVisible();
    await page.getByLabel('Skip bad rows',{exact:true}).check();await page.getByRole('button',{name:'Save 2 rows',exact:true}).click();await expect(page.getByRole('heading',{name:'Import complete'})).toBeVisible();
    expect((await client.from('cost_items').select('item').eq('project_id',id).eq('item',"'=literal")).data).toHaveLength(1);
    // Full-data mode must save all 501 rows, not just the initial 200-row source preview.
    await page.goto(`/projects/${id}/import`);await page.getByLabel('Choose cost data file',{exact:true}).setInputFiles({name:'all-rows.csv',mimeType:'text/csv',buffer:Buffer.from('Item,Actual\n'+Array.from({length:501},(_,i)=>`Row ${i},1`).join('\n'))});
    await expect(page.getByText('501 rows found · Showing 200 rows',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Continue to mapping',exact:true}).click();await page.getByRole('button',{name:'Preview rows',exact:true}).click();await expect(page.getByText('501 rows ready, 0 with problems',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Save 501 rows',exact:true}).click();await expect(page.getByRole('heading',{name:'Import complete'})).toBeVisible();
    const fullSource=await client.from('data_sources').select('id').eq('project_id',id).eq('name','all-rows.csv').single();
    expect((await client.from('cost_items').select('id',{count:'exact',head:true}).eq('source_id',fullSource.data!.id)).count).toBe(501);
    await page.getByRole('link',{name:'Go to dashboard',exact:true}).click();await expect(page).toHaveURL(new RegExp(`/projects/${id}$`));await page.reload();await expect(page.getByRole('heading',{name:'Mapping tests',exact:true})).toBeVisible();
    // Direct route invalid rows and cross-user requests must fail without modifying data.
    const invalidBody={source:{type:'csv',name:'bad'},mapping:{item:'Item'},columns:['Item'],currency:'USD',mode:'append',rows:[{item:'',group:null,category:null,estimated:0,actual:1,currency:'USD',date:null,notes:null,sourceRef:null,confidence:null}]};
    expect((await page.request.post(`/api/projects/${id}/import/commit`,{data:invalidBody})).status()).toBe(400);
    const other=await browser.newContext();try{const p=await other.newPage();await p.goto('/login');await p.getByLabel('Email',{exact:true}).fill(`costlens-mapping-b-${run}@example.com`);await p.getByLabel('Password',{exact:true}).fill(password);await p.getByRole('button',{name:'Log in',exact:true}).click();await expect(p).toHaveURL(/\/projects$/);expect((await other.request.post(`/api/projects/${id}/import/commit`,{data:invalidBody})).status()).toBe(404);expect((await other.request.get(`/api/projects/${id}/import/templates`)).status()).toBe(404);}finally{await other.close();}
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  } finally {for(const id of ids)expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();}
});

test('live JSON API and HTML table import through fetch, mapping and transactional commit', async ({ page }) => {
  test.skip(process.env.COSTLENS_LOCAL_AUTH_E2E !== '1' || process.env.COSTLENS_LIVE_ONLINE !== '1', 'Opt-in real public network and local Supabase check');
  test.setTimeout(60000);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;expect(['localhost','127.0.0.1']).toContain(new URL(url).hostname);
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options),client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
  const email=`costlens-live-mapping-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const uid=created.data.user!.id;
  try {
    expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();
    const project=await client.from('projects').insert({owner_id:uid,name:'Live online mapping',currency:'USD'}).select('id').single();expect(project.error).toBeNull();const id=project.data!.id;
    await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page).toHaveURL(/\/projects$/);
    for(const [source,kind,itemColumn,count] of [['https://jsonplaceholder.typicode.com/todos','JSON / CSV / REST API','title',200],['https://www.w3.org/WAI/tutorials/tables/one-header/','Web page table','Date',3]] as const) {
      await page.goto(`/projects/${id}/import`);await page.getByRole('tab',{name:'From a link'}).click();await page.getByLabel('Source URL',{exact:true}).fill(source);
      await page.getByRole('combobox',{name:'Source type',exact:true}).click();await page.getByRole('option',{name:kind,exact:true}).click();await page.getByRole('button',{name:'Fetch source',exact:true}).click();
      await expect(page.getByRole('button',{name:'Continue to mapping',exact:true})).toBeVisible({timeout:15000});await page.getByRole('button',{name:'Continue to mapping',exact:true}).click();await expect(page.getByText('Loading saved mappings…')).not.toBeVisible();
      // Select explicitly rather than relying on these unrelated public datasets having cost headings.
      await page.getByRole('combobox',{name:`Map ${itemColumn}`,exact:true}).click();await page.getByRole('option',{name:'Item',exact:true}).click();
      // Date is used as an item label for the HTML example, not interpreted as a cost date.
      await page.getByRole('button',{name:'Preview rows',exact:true}).click();await expect(page.getByText(`${count} rows ready, 0 with problems`,{exact:true})).toBeVisible();await page.getByRole('button',{name:`Save ${count} rows`,exact:true}).click();await expect(page.getByRole('heading',{name:'Import complete'})).toBeVisible();
    }
    expect((await client.from('cost_items').select('id',{count:'exact',head:true}).eq('project_id',id)).count).toBe(203);
  } finally {expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
});
