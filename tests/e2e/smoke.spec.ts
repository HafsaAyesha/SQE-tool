import { test, expect } from './fixtures';
test('landing links straight into the app and themes persist', async ({ page }) => {
  const runtimeErrors: string[] = [];
  const failedBundles: string[] = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('response', response => { const path = new URL(response.url()).pathname; if (response.status() >= 400 && path.endsWith('.js')) failedBundles.push(path); });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByText('Analyse costs from any file, tool or recording', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Login' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '/projects');
  for (const theme of ['Light', 'Dark']) {
    await page.getByRole('button', { name: 'Choose theme' }).click();
    await page.getByRole('menuitem', { name: theme, exact: true }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveClass(new RegExp(theme.toLowerCase()));
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(runtimeErrors).toEqual([]);
  expect(failedBundles).toEqual([]);
});
test('the removed login and sign-up pages send visitors into the workspace', async ({ page }) => {
  test.skip(process.env.COSTLENS_LOCAL_AUTH_E2E !== '1', 'Guest sessions need the local Supabase runner');
  for (const path of ['/login', '/signup', '/import', '/reports', '/settings']) {
    await page.goto(path);
    await expect(page).not.toHaveURL(/\/(login|signup)$/);
    await expect(page.getByRole('button', { name: 'User menu' })).toBeVisible();
  }
});
