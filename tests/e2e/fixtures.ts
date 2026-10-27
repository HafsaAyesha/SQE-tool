import { test as base, expect } from '@playwright/test';
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
