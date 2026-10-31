import { test as base, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
// Different tests model different client IPs; production trust is never bypassed.
export const test=base.extend({context:async({context},provide,info)=>{
  if(process.env.COSTLENS_LOCAL_AUTH_E2E==='1'){
    const hash=createHash('sha256').update(info.testId).digest('hex');
    await context.setExtraHTTPHeaders({'x-forwarded-for':`2001:db8:${hash.slice(0,4)}:${hash.slice(4,8)}::1`});
  }
  await provide(context);
}});
export { expect };
// The login screens were removed (visitors get guest workspaces), so tests sign a known test user in through the auth API.
// page.request shares the browser context's cookies, so the page is signed in afterwards.
export async function signIn(page:Page,email:string,password:string){
  const response=await page.request.post('/api/auth/authenticate',{data:{mode:'login',email,password}});
  expect(response.status(),'test user sign-in').toBe(200);
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/projects$/);
}
