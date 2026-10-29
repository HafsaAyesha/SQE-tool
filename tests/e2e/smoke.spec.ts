import { test, expect } from './fixtures';
test('landing, authentication forms and persistent themes', async ({ page }) => {
  const runtimeErrors: string[] = [];
  const failedBundles: string[] = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('response', response => { const path = new URL(response.url()).pathname; if (response.status() >= 400 && path.endsWith('.js')) failedBundles.push(path); });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByText('Analyse costs from any file, tool or recording', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  for (const theme of ['Light', 'Dark']) {
    await page.getByRole('button', { name: 'Choose theme' }).click();
    await page.getByRole('menuitem', { name: theme, exact: true }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveClass(new RegExp(theme.toLowerCase()));
  }
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await expect(page.getByText('Use at least 10 characters.')).toBeVisible();
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page.getByRole('heading', { name: 'A little clarity goes a long way' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('invalid');
  await page.getByLabel('Password', { exact: true }).fill('short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await expect(page.getByText('Use at least 10 characters.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (process.env.COSTLENS_CAPTURE_SCREENSHOTS === '1') await page.screenshot({ path: `docs/screenshots/1.2-signup-${page.viewportSize()!.width}-dark.png`, fullPage: true });
  expect(runtimeErrors).toEqual([]);
  expect(failedBundles).toEqual([]);
});
test('signed-out visitors cannot access any workspace route', async ({ page }) => {
  for (const path of ['/projects', '/projects/11111111-1111-4111-8111-111111111111', '/import', '/reports', '/settings']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'User menu' })).not.toBeVisible();
  }
});
