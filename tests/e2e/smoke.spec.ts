import { test, expect } from '@playwright/test';
test('landing and responsive shell work in light and dark themes', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Every cost.One clear picture.');
  await expect(page.getByText('Analyse costs from any file, tool or recording', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await page.goto('/');
  await page.getByRole('link', { name: 'Get started', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'A little clarity goes a long way' })).toBeVisible();
  await page.getByRole('link', { name: 'Explore workspace' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select a project' })).toBeDisabled();
  for (const theme of ['Light', 'Dark']) {
    await page.getByRole('button', { name: 'Choose theme' }).click();
    await page.getByRole('menuitem', { name: theme, exact: true }).click();
    await expect(page.locator('html')).toHaveClass(new RegExp(theme.toLowerCase()));
    await expect(page.getByRole('menu')).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(new RegExp(theme.toLowerCase()));
    await expect(page.getByRole('banner')).toBeVisible();
    const mobileViewport = testInfo.project.name === 'mobile';
    if (!mobileViewport) await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await page.screenshot({ path: `docs/screenshots/1.1-shell-${page.viewportSize()!.width}-${theme.toLowerCase()}.png`, fullPage: true, animations: 'disabled' });
    if (mobileViewport) {
      await page.getByRole('button', { name: 'Open navigation' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      await page.screenshot({ path: `docs/screenshots/1.1-menu-390-${theme.toLowerCase()}.png`, fullPage: true, animations: 'disabled' });
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).not.toBeVisible();
    }
  }
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const mobile = testInfo.project.name === 'mobile';
  if (mobile) await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Import your data' })).toBeVisible();
  if (mobile) { await expect(page.getByRole('dialog')).not.toBeVisible(); await page.getByRole('button', { name: 'Open navigation' }).click(); }
  await expect(page.getByRole('link', { name: 'Import', exact: true })).toHaveAttribute('aria-current', 'page');
  for (const [link, heading] of [['Reports','Your reports'],['Settings','Workspace settings']]) {
    await page.getByRole('link', { name: link, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    if (mobile) await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  if (mobile) await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'User menu' }).click();
  await expect(page.getByText('Guest workspace')).toBeVisible();
  expect(errors).toEqual([]);
});

test('landing illustration fits both themes and the narrow viewport', async ({ page }) => {
  await page.goto('/');
  for (const theme of ['Light', 'Dark']) {
    await page.getByRole('button', { name: 'Choose theme' }).click();
    await page.getByRole('menuitem', { name: theme, exact: true }).click();
    await expect(page.getByRole('menu')).not.toBeVisible();
    await expect(page.getByRole('img', { name: /Illustrative CodeAudit/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/screenshots/1.1-landing-${page.viewportSize()!.width}-${theme.toLowerCase()}.png`, fullPage: true });
  }
});
