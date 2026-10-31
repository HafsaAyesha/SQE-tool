import { test, expect } from './fixtures';

// Opt-in local-only workflow: login and sign-up were replaced by automatic guest workspaces.
test('local Supabase gives each new browser its own guest workspace', async ({ page, browser }) => {
  test.skip(process.env.COSTLENS_LOCAL_AUTH_E2E !== '1', 'Requires the local Supabase browser runner');
  expect(['localhost', '127.0.0.1']).toContain(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname);
  for (const path of ['/login', '/signup', '/projects']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/projects$/);
  }
  await expect(page.getByRole('heading', { name: 'Create your first project' })).toBeVisible();
  await page.getByRole('button', { name: 'User menu' }).click();
  await expect(page.getByText('Guest workspace', { exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Sign out' })).toHaveCount(0);
  const first = (await page.context().cookies()).map(cookie => `${cookie.name}=${cookie.value}`).sort().join(';');
  await page.reload();
  expect((await page.context().cookies()).map(cookie => `${cookie.name}=${cookie.value}`).sort().join(';')).toBe(first);
  const other = await browser.newContext();
  try {
    const otherPage = await other.newPage();
    await otherPage.goto('/projects');
    await expect(otherPage).toHaveURL(/\/projects$/);
    expect((await other.cookies()).map(cookie => cookie.value)).not.toContain((await page.context().cookies())[0]?.value);
  } finally { await other.close(); }
});
