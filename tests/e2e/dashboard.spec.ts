import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';

test('CodeAudit dashboard shares URL filters across KPIs/charts/table, supports keyboard drilldown and both themes', async ({ page }) => {
  test.skip(process.env.COSTLENS_LOCAL_AUTH_E2E!=='1','Requires real local Supabase');
  test.setTimeout(120000);
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;expect(['localhost','127.0.0.1']).toContain(new URL(url).hostname);
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  const admin=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,options),client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,options);
  const email=`costlens-dashboard-${randomUUID()}@example.com`,password=randomBytes(24).toString('base64url');
  const created=await admin.auth.admin.createUser({email,password,email_confirm:true});expect(created.error).toBeNull();const uid=created.data.user!.id;
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try {
    expect((await client.auth.signInWithPassword({email,password})).error).toBeNull();
    const project=await client.from('projects').insert({owner_id:uid,name:'CodeAudit dashboard',currency:'USD'}).select('id').single();expect(project.error).toBeNull();const id=project.data!.id;
    const sources=await client.from('data_sources').insert([{project_id:id,type:'csv',name:'CodeAudit CSV'},{project_id:id,type:'json',name:'CodeAudit JSON'}]).select('id,name');expect(sources.error).toBeNull();
    const a=sources.data!.find(source=>source.name==='CodeAudit CSV')!.id,b=sources.data!.find(source=>source.name==='CodeAudit JSON')!.id;
    expect((await client.from('cost_items').insert([
      {project_id:id,source_id:a,item:'Development',grp:'Build',category:'Labour',estimated:3000,actual:2800,date:'2026-10-01'},
      {project_id:id,source_id:a,item:'Cloud hosting',grp:'Build',category:'Cloud',estimated:100,actual:80,date:'2026-10-02'},
      {project_id:id,source_id:b,item:'AI API',grp:'Test',category:'AI API',estimated:200,actual:250,date:'2026-10-03'},
    ])).error).toBeNull();
    await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page).toHaveURL(/\/projects$/);
    await page.goto(`/projects/${id}`);
    const kpi=(name:string)=>page.getByRole('region',{name,exact:true});
    const table=page.getByRole('region',{name:'Cost items',exact:true});
    await expect(kpi('Total estimated').getByText('$3,300.00',{exact:true})).toBeVisible();await expect(kpi('Total actual').getByText('$3,130.00',{exact:true})).toBeVisible();
    await expect(kpi('Variance').getByText('-$170.00',{exact:true})).toBeVisible();await expect(kpi('% Variance').getByText('-5.2%',{exact:true})).toBeVisible();await expect(kpi('Items over budget').getByText('1 of 3',{exact:true})).toBeVisible();
    const bars=kpi('Estimated vs actual');const pct=kpi('Variance by percentage');const line=kpi('Cumulative cost over time');const donut=kpi('Actual cost share');
    await expect(bars.locator('.recharts-wrapper > svg.recharts-surface')).toBeVisible();await expect(pct.locator('.recharts-wrapper > svg.recharts-surface')).toBeVisible();await expect(line.locator('.recharts-wrapper > svg.recharts-surface')).toBeVisible();await expect(donut.locator('.recharts-wrapper > svg.recharts-surface')).toBeVisible();
    await expect(pct.locator('.recharts-yAxis .recharts-cartesian-axis-tick-value')).toHaveText(['AI API','Labour','Cloud']);await expect(pct.locator('.recharts-reference-line-line')).toHaveCount(1);
    // Bars are keyboard-operable; the focus changes only table rows and is stored in the URL.
    const cloudBar=bars.getByRole('button',{name:'Filter table to Cloud: Actual',exact:true});await cloudBar.hover();await expect(bars.locator('.recharts-tooltip-wrapper')).toContainText('$80.00');await cloudBar.focus();await cloudBar.press('Enter');
    await expect(page).toHaveURL(/focus=Cloud/);await expect(table.getByText('1–1 of 1 items',{exact:true})).toBeVisible();await expect(table.getByRole('cell',{name:'Cloud hosting',exact:true})).toBeVisible();await expect(kpi('Total actual').getByText('$3,130.00',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Clear chart focus',exact:true}).click();await expect(table.getByText('1–3 of 3 items',{exact:true})).toBeVisible();
    await page.getByRole('radio',{name:'Group',exact:true}).click();await expect(page).toHaveURL(/by=group/);await expect(bars.getByRole('button',{name:'Filter table to Build: Actual',exact:true})).toBeVisible();await expect(line.getByText('Build · Actual',{exact:true})).toBeVisible();await expect(donut.getByRole('button',{name:'Filter table to Build: cost share',exact:true})).toBeVisible();
    await page.getByRole('radio',{name:'Source',exact:true}).click();await expect(bars.getByRole('button',{name:'Filter table to CodeAudit CSV: Actual',exact:true})).toBeVisible();
    await page.getByRole('combobox',{name:'Filter by source',exact:true}).click();await page.getByRole('option',{name:'CodeAudit JSON',exact:true}).click();
    expect(new URL(page.url()).searchParams.get('source')).toBe(b);await expect(kpi('Total actual').getByText('$250.00',{exact:true})).toBeVisible();await expect(table.getByText('1–1 of 1 items',{exact:true})).toBeVisible();
    await page.getByRole('combobox',{name:'Filter by category',exact:true}).click();await page.getByRole('option',{name:'Cloud',exact:true}).click();await expect(page.getByRole('heading',{name:'No costs match these filters',exact:true})).toBeVisible();await expect(table.getByText('No matching cost items',{exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Clear filters',exact:true}).click();await page.getByRole('radio',{name:'Category',exact:true}).click();
    await page.getByRole('combobox',{name:'Filter by category',exact:true}).click();await page.getByRole('option',{name:'Cloud',exact:true}).click();await page.getByLabel('From date',{exact:true}).fill('2026-10-02');await page.getByLabel('To date',{exact:true}).fill('2026-10-02');
    await expect(kpi('Total estimated').getByText('$100.00',{exact:true})).toBeVisible();await expect(kpi('Total actual').getByText('$80.00',{exact:true})).toBeVisible();await page.reload();
    await expect(page.getByLabel('From date',{exact:true})).toHaveValue('2026-10-02');await expect(kpi('Total actual').getByText('$80.00',{exact:true})).toBeVisible();
    const shared=await page.context().newPage();try{await shared.goto(page.url());await expect(shared.getByRole('region',{name:'Total actual',exact:true}).getByText('$80.00',{exact:true})).toBeVisible();await expect(shared.getByRole('region',{name:'Cost items',exact:true}).getByText('1–1 of 1 items',{exact:true})).toBeVisible();}finally{await shared.close();}
    await page.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(kpi('Total actual').getByText('$3,130.00',{exact:true})).toBeVisible();await page.goBack();await expect(kpi('Total actual').getByText('$80.00',{exact:true})).toBeVisible();await page.goForward();await expect(kpi('Total actual').getByText('$3,130.00',{exact:true})).toBeVisible();
    await page.getByRole('radio',{name:'Month',exact:true}).click();await expect(bars.getByRole('button',{name:'Filter table to Oct 2026: Actual',exact:true})).toBeVisible();
    // Theme tokens recolour existing SVGs, with no reload or chart reconstruction required.
    await page.getByRole('button',{name:'Choose theme',exact:true}).click();await page.getByRole('menuitem',{name:'Light',exact:true}).click();
    const actualBar=bars.getByRole('button',{name:'Filter table to Oct 2026: Actual',exact:true});const lightFill=await actualBar.evaluate(node=>getComputedStyle(node).fill);
    await page.getByRole('button',{name:'Choose theme',exact:true}).click();await page.getByRole('menuitem',{name:'Dark',exact:true}).click();await expect(page.locator('html')).toHaveClass(/dark/);expect(await actualBar.evaluate(node=>getComputedStyle(node).fill)).not.toBe(lightFill);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    expect((await client.from('cost_items').insert([{project_id:id,source_id:a,item:'Foreign currency',category:'Cloud',estimated:5,actual:8,currency:'EUR',date:'2026-10-02'},{project_id:id,item:'Manual note',category:'Tools',estimated:null,actual:null,currency:'USD'}])).error).toBeNull();
    await page.reload();await expect(kpi('Total actual').getByText('$3,130.00',{exact:true})).toBeVisible();await expect(page.getByText('1 item in other currencies stays in the table. Totals and charts use USD only.',{exact:true})).toBeVisible();await expect(table.getByText('1–5 of 5 items',{exact:true})).toBeVisible();
    await page.getByRole('combobox',{name:'Filter by source',exact:true}).click();await page.getByRole('option',{name:'Manual',exact:true}).click();await expect(line.getByText('No dated costs yet',{exact:true})).toBeVisible();await expect(line.locator('.recharts-wrapper > svg.recharts-surface')).toHaveCount(0);await expect(donut.getByText('Positive actual costs are needed to show cost shares.',{exact:true})).toBeVisible();await expect(kpi('% Variance').getByText('n/a',{exact:true})).toBeVisible();
    await page.goto(`/projects/${id}?from=2026-02-30&by=invalid`);await expect(page.getByRole('alert').filter({hasText:'Some URL filters were invalid'})).toBeVisible();await expect(kpi('Total actual').getByText('$3,130.00',{exact:true})).toBeVisible();
    const empty=await client.from('projects').insert({owner_id:uid,name:'Empty dashboard'}).select('id').single();expect(empty.error).toBeNull();await page.goto(`/projects/${empty.data!.id}`);await expect(page.getByRole('heading',{name:'Your cost story starts here',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Import cost data',exact:true})).toHaveAttribute('href',`/projects/${empty.data!.id}/import`);await expect(page.getByRole('button',{name:'Add row',exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  } finally {expect((await admin.auth.admin.deleteUser(uid)).error).toBeNull();}
});
