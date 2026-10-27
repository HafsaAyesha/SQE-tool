import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';

test('online wizard rejects internal URLs through the real API and hands controlled public tables to mapping', async ({ page }) => {
  test.skip(process.env.COSTLENS_LOCAL_AUTH_E2E !== '1', 'Requires local Supabase');
  test.setTimeout(60000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  expect(['localhost', '127.0.0.1']).toContain(new URL(url).hostname);
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, opts);
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, opts);
  const email = `costlens-online-${randomUUID()}@example.com`, password = randomBytes(24).toString('base64url');
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  expect(created.error).toBeNull(); const userId = created.data.user!.id;
  try {
    expect((await client.auth.signInWithPassword({ email, password })).error).toBeNull();
    const project = await client.from('projects').insert({ owner_id: userId, name: 'Online import tests', currency: 'USD' }).select('id').single();
    expect(project.error).toBeNull();
    await page.goto('/login'); await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Password', { exact: true }).fill(password); await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await page.goto(`/projects/${project.data!.id}/import`);
    await page.getByRole('tab', { name: 'From a link' }).click();
    await page.getByLabel('Source URL', { exact: true }).fill('http://127.0.0.1/latest/meta-data');
    await page.getByRole('button', { name: 'Fetch source', exact: true }).click();
    await expect(page.getByRole('form', { name: 'Online source' }).getByRole('alert')).toContainText(/public internet/);
    expect((await client.from('data_sources').select('id').eq('project_id', project.data!.id)).data).toEqual([]);
    // Controlled API responses test browser state/handoff only; real public-network tests are separate.
    const requests: Record<string, unknown>[] = [];
    await page.route('**/import/fetch', async route => {
      const body = route.request().postDataJSON(); requests.push(body);
      const html = body.type === 'html'; const selected = body.tableIndex === 1 || body.jsonPath === '/tools';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ columns: ['Item', 'Actual'], rows: [{ Item: selected ? 'Licenses' : 'Cloud hosting', Actual: selected ? 40 : 80 }], meta: { sourceType: html ? 'html' : body.type === 'gsheets' ? 'gsheets' : 'url', fileName: html ? 'web-table.html' : 'remote-source.csv', warnings: [], ...(html ? { tables: ['1. Costs', '2. Tools'], tableIndex: body.tableIndex ?? 0 } : body.type === 'url' ? { jsonPaths: ['/costs', '/tools'] } : {}) }, totalCount: 1, previewLimit: 200 }) });
    });
    for (const [type, label, source] of [['gsheets', 'Google Sheets', 'https://docs.google.com/spreadsheets/d/public-test/edit'], ['url', 'JSON / CSV / REST API', 'https://public.example/data'], ['html', 'Web page table', 'https://public.example/table']] as const) {
      await page.getByLabel('Source URL', { exact: true }).fill(source);
      await page.getByRole('combobox', { name: 'Source type' }).click(); await page.getByRole('option', { name: label, exact: true }).click();
      await page.getByRole('button', { name: 'Fetch source', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Source table preview' }).getByRole('cell', { name: 'Cloud hosting', exact: true })).toBeVisible();
      expect(requests.at(-1)?.type).toBe(type);
      if (type === 'url') { await page.getByRole('combobox', { name: 'Data path' }).click(); await page.getByRole('option', { name: '/tools', exact: true }).click(); await expect(page.getByRole('cell', { name: 'Licenses', exact: true })).toBeVisible(); }
      if (type === 'html') { await page.getByRole('combobox', { name: 'Web table' }).click(); await page.getByRole('option', { name: '2. Tools', exact: true }).click(); await expect(page.getByRole('cell', { name: 'Licenses', exact: true })).toBeVisible(); }
      await page.getByRole('button', { name: 'Continue to mapping', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Map your cost columns', exact: true })).toBeVisible();
      await expect(page.locator('li[aria-current=step]')).toContainText('Mapping');
      await page.getByRole('button', { name: 'Back to source', exact: true }).click();
    }
    expect((await client.from('cost_items').select('id').eq('project_id', project.data!.id)).data).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally { expect((await admin.auth.admin.deleteUser(userId)).error).toBeNull(); }
});
