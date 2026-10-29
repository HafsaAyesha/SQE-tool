import { test, expect } from './fixtures';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { applyMapping, suggestMapping } from '../../lib/import/mapping';

test('CodeAudit variance, percentages, status bands, zero/missing values and computed sorting', async ({ page }) => {
  test.skip(process.env.COSTLENS_LOCAL_AUTH_E2E !== '1','Requires real local Supabase');
  test.setTimeout(60000);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;expect(['localhost','127.0.0.1']).toContain(new URL(url).hostname);
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options),client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
  const email=`costlens-calc-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const uid=created.data.user!.id;
  try {
    expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();
    const project=await client.from('projects').insert({owner_id:uid,name:'CodeAudit calculations',currency:'USD'}).select('id').single();expect(project.error).toBeNull();const id=project.data!.id;
    await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page).toHaveURL(/\/projects$/);
    const parsed=await page.request.post(`/api/projects/${id}/import/parse`,{multipart:{file:{name:'codeaudit.csv',mimeType:'text/csv',buffer:readFileSync('tests/fixtures/codeaudit.csv')},full:'true'}});expect(parsed.status()).toBe(200);
    const raw=await parsed.json(),mapping=suggestMapping(raw.columns).mapping,result=applyMapping(raw,mapping,{currency:'USD'});expect(result.errors).toEqual([]);
    expect((await page.request.post(`/api/projects/${id}/import/commit`,{data:{source:{type:raw.meta.sourceType,name:'codeaudit.csv'},mapping,columns:raw.columns,currency:'USD',mode:'append',rows:result.rows}})).status()).toBe(200);
    expect((await client.from('cost_items').insert([
      {project_id:id,item:'On boundary',estimated:100,actual:105},
      {project_id:id,item:'Zero baseline',estimated:0,actual:10},
      {project_id:id,item:'Missing actual',estimated:50,actual:null},
      {project_id:id,item:'Exact budget',estimated:100,actual:100},
      {project_id:id,item:'Missing estimate',estimated:null,actual:3},
      {project_id:id,item:'Small cents',estimated:.1,actual:.3},
    ])).error).toBeNull();
    await page.goto(`/projects/${id}`);
    const table=page.getByRole('region',{name:'Cost items',exact:true});
    for(const [item,variance,pct,status] of [
      ['Development','-$200.00','-6.7%','Under budget'],['Cloud hosting','-$20.00','-20%','Under budget'],['AI API','+$50.00','+25%','Over budget'],
      ['On boundary','+$5.00','+5%','On target'],['Zero baseline','+$10.00','n/a','Over budget'],['Missing actual','—','n/a','Unknown'],
      ['Exact budget','$0.00','0%','On target'],['Missing estimate','—','n/a','Unknown'],['Small cents','+$0.20','+200%','Over budget'],
    ]) {
      const record=table.getByRole('row').filter({has:page.getByRole('cell',{name:item,exact:true})});
      await expect(record.getByRole('cell').nth(5)).toHaveText(variance);await expect(record.getByRole('cell').nth(6)).toHaveText(pct);await expect(record.getByRole('cell').nth(7)).toHaveText(status);
      if(variance.startsWith('+')){await expect(record.getByRole('cell').nth(5).locator('.text-over')).toBeVisible();await expect(record.getByRole('cell').nth(5).locator('svg.lucide-arrow-up')).toHaveCount(1);}
      if(variance.startsWith('-')){await expect(record.getByRole('cell').nth(5).locator('.text-under')).toBeVisible();await expect(record.getByRole('cell').nth(5).locator('svg.lucide-arrow-down')).toHaveCount(1);}
    }
    await table.getByRole('button',{name:'Sort by Variance',exact:true}).click();await expect(table.locator('tbody tr').first().getByRole('cell').first()).toHaveText('Development');
    await table.getByRole('button',{name:'Sort by Variance',exact:true}).click();await expect(table.locator('tbody tr').first().getByRole('cell').first()).toHaveText('AI API');
    await table.getByRole('button',{name:'Sort by % Variance',exact:true}).click();await expect(table.locator('tbody tr').first().getByRole('cell').first()).toHaveText('Cloud hosting');
    await table.getByRole('button',{name:'Sort by % Variance',exact:true}).click();await expect(table.locator('tbody tr').first().getByRole('cell').first()).toHaveText('Small cents');
    // Values survive a reload and use the same component in dark mode.
    await page.reload();await page.getByRole('button',{name:'Choose theme',exact:true}).click();await page.getByRole('menuitem',{name:'Dark',exact:true}).click();
    await expect(page.locator('html')).toHaveClass(/dark/);await expect(table.getByRole('row').filter({has:page.getByRole('cell',{name:'AI API',exact:true})}).getByRole('cell').nth(5)).toHaveText('+$50.00');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    // Invalid import amounts must remain fixable when the same table sorts computed columns.
    await page.goto(`/projects/${id}/import`);
    await page.getByLabel('Choose cost data file',{exact:true}).setInputFiles({name:'invalid-amount.csv',mimeType:'text/csv',buffer:Buffer.from('Item,Estimated,Actual\nOut of range,10,1000000000000000')});
    await page.getByRole('button',{name:'Continue to mapping',exact:true}).click();await page.getByRole('button',{name:'Preview rows',exact:true}).click();
    await expect(page.getByText('0 rows ready, 1 with problems',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Sort by Variance',exact:true}).click();await page.getByRole('button',{name:'Sort by % Variance',exact:true}).click();await page.getByRole('button',{name:'Sort by Status',exact:true}).click();
    await expect(page.getByLabel('Fix row 1 Actual',{exact:true})).toBeVisible();
  } finally {expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
});
