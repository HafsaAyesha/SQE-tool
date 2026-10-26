import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';

// Opt-in local-only workflow: no email delivery or hosted account side effects.
test('local Supabase signup, email menu, logout and login', async ({ page }) => {
  test.skip(process.env.COSTLENS_LOCAL_AUTH_E2E !== '1', 'Requires the local Supabase browser runner');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  expect(['localhost', '127.0.0.1']).toContain(new URL(url).hostname);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, options);
  const client = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, options);
  const email = `costlens-browser-${randomUUID()}@example.com`;
  const password = randomBytes(24).toString('base64url');
  let userId: string | undefined;
  try {
    await page.goto('/signup');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await page.getByRole('button', { name: 'User menu' }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
    await page.getByRole('button', { name: 'User menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
  } finally {
    const { data } = await client.auth.signInWithPassword({ email, password });
    userId = data.user?.id;
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      expect(error, 'Remove only this browser test’s generated account').toBeNull();
    }
  }
});
