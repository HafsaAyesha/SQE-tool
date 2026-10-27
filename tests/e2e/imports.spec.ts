import { test, expect } from './fixtures';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

test('structured import wizard options, paste, previews, rejection and project ownership', async ({ page, browser }) => {
  test.skip(process.env.COSTLENS_LOCAL_AUTH_E2E !== '1', 'Requires real local Supabase');
  test.setTimeout(90000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  expect(['localhost', '127.0.0.1']).toContain(new URL(url).hostname);
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, opts);
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, opts);
  const run = randomUUID();
  const password = randomBytes(24).toString('base64url');
  const userIds: string[] = [];
  try {
    for (const label of ['a', 'b']) {
      const created = await admin.auth.admin.createUser({ email: `costlens-imports-${run}-${label}@example.com`, password, email_confirm: true });
      expect(created.error).toBeNull(); userIds.push(created.data.user!.id);
    }
    expect((await client.auth.signInWithPassword({ email: `costlens-imports-${run}-a@example.com`, password })).error).toBeNull();
    const project = await client.from('projects').insert({ owner_id: userIds[0], name: 'CodeAudit import', currency: 'USD' }).select('id').single();
    expect(project.error).toBeNull();
    const id = project.data!.id;
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(`costlens-imports-${run}-a@example.com`);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await page.goto(`/projects/${id}`);
    await page.getByRole('main').getByRole('link', { name: 'Import', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${id}/import$`), { timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Import cost data', exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Import progress' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'From a link' })).toBeEnabled();
    const upload = page.getByLabel('Choose cost data file', { exact: true });
    const panel = page.getByRole('region', { name: 'Source table preview' });
    await upload.setInputFiles('tests/fixtures/codeaudit.xlsx');
    await expect(panel.getByRole('cell', { name: 'Development', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Worksheet', exact: true }).click();
    await page.getByRole('option', { name: 'Tools', exact: true }).click();
    await expect(panel.getByRole('cell', { name: 'Licenses', exact: true })).toBeVisible();
    await expect(panel.getByText('1 row found · Showing 1 row', { exact: true })).toBeVisible();
    await upload.setInputFiles('tests/fixtures/codeaudit.json');
    await expect(panel.getByRole('heading', { name: 'codeaudit.json', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Data path', exact: true }).click();
    await page.getByRole('option', { name: '/tables/tools', exact: true }).click();
    await expect(panel.getByRole('cell', { name: 'Licenses', exact: true })).toBeVisible();
    for (const name of ['codeaudit.csv', 'codeaudit.ods', 'codeaudit.xml', 'codeaudit-msproject.xml']) {
      await upload.setInputFiles(`tests/fixtures/${name}`);
      await expect(panel.getByRole('heading', { name, exact: true })).toBeVisible();
      await expect(panel.getByText('3 rows found · Showing 3 rows', { exact: true })).toBeVisible();
    }
    await expect(panel.getByRole('cell', { name: '2800', exact: true })).toBeVisible();
    for (const [name, message] of [['fake.csv', /Executable/], ['huge.csv', /5,000 rows/], ['bomb.xlsx', /32 MB/], ['doctype.xml', /DOCTYPE/]] as const) {
      await upload.setInputFiles(`tests/fixtures/${name}`);
      await expect(page.getByRole('main').getByRole('alert')).toContainText(message);
      await expect(panel).not.toBeVisible();
    }
    await page.getByRole('tab', { name: 'Paste data' }).click();
    await page.getByLabel('Tab-separated cost data', { exact: true }).fill(readFileSync('tests/fixtures/codeaudit-paste.txt', 'utf8'));
    await page.getByRole('button', { name: 'Read pasted data', exact: true }).click();
    await expect(panel.getByRole('cell', { name: 'Development', exact: true })).toBeVisible();
    await expect(panel.getByRole('heading', { name: 'pasted-data.txt', exact: true })).toBeVisible();
    const preview = await page.request.post(`/api/projects/${id}/import/parse`, { multipart: { file: { name: 'preview.csv', mimeType: 'text/csv', buffer: Buffer.from('Item,Actual\n'+Array.from({ length: 501 }, (_, i) => `Cost ${i},1`).join('\n')) } } });
    expect(preview.status()).toBe(200);
    const raw = await preview.json();
    expect(raw.rows).toHaveLength(200); expect(raw.totalCount).toBe(501);
    expect((await client.from('cost_items').select('id').eq('project_id', id)).data).toEqual([]);
    expect((await client.from('data_sources').select('id').eq('project_id', id)).data).toEqual([]);
    const other = await browser.newContext();
    try {
      const otherPage = await other.newPage();
      await otherPage.goto('/login');
      await otherPage.getByLabel('Email', { exact: true }).fill(`costlens-imports-${run}-b@example.com`);
      await otherPage.getByLabel('Password', { exact: true }).fill(password);
      await otherPage.getByRole('button', { name: 'Log in', exact: true }).click();
      await expect(otherPage).toHaveURL(/\/projects$/);
      const forbidden = await other.request.post(`/api/projects/${id}/import/parse`, { multipart: { file: { name: 'fake.csv', mimeType: 'text/csv', buffer: readFileSync('tests/fixtures/fake.csv') } } });
      expect(forbidden.status()).toBe(404);
      expect(await forbidden.json()).toEqual({ error: 'Project not found.' });
    } finally { await other.close(); }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    for (const id of userIds) expect((await admin.auth.admin.deleteUser(id)).error).toBeNull();
  }
});
