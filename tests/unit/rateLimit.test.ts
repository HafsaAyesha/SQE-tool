import {afterEach,describe,expect,it,vi}from'vitest';
import{randomUUID}from'node:crypto';
vi.mock('server-only',()=>({}));
import{enforceRateLimit,dailyAiRemaining,RateLimitError,RateLimitUnavailableError,rateLimitResponse,loginIdentifier}from'@/lib/security/rateLimit';
afterEach(()=>vi.unstubAllEnvs());
describe('trusted client IPs',()=>{
  it('ignores spoofable headers unless the deployment trusts its edge proxy',()=>{
    vi.stubEnv('VERCEL','');vi.stubEnv('TRUST_PROXY_HEADERS','');
    const headers=new Headers({'x-forwarded-for':'203.0.113.10'});expect(loginIdentifier(headers)).toBe('unknown-client');
    vi.stubEnv('TRUST_PROXY_HEADERS','true');expect(loginIdentifier(headers)).toBe('203.0.113.10');
    expect(loginIdentifier(new Headers({'x-forwarded-for':'::ffff:203.0.113.10'}))).toBe('203.0.113.10');
    expect(loginIdentifier(new Headers({'x-forwarded-for':'not-an-ip'}))).toBe('unknown-client');
  });
});
describe.skipIf(process.env.COSTLENS_LOCAL_REDIS!=='1')('real Redis-backed Upstash limits',()=>{
  it.each([['ai',20],['import',30],['login',10]]as const)('rejects request above the %s window with HTTP 429 and Retry-After',async(kind,limit)=>{
    const id=randomUUID();for(let i=0;i<limit;i++)expect((await enforceRateLimit(kind,id)).remaining).toBe(limit-i-1);
    let error:unknown;try{await enforceRateLimit(kind,id);}catch(cause){error=cause;}
    expect(error).toBeInstanceOf(RateLimitError);const response=rateLimitResponse(error)!;expect(response.status).toBe(429);expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);expect((await response.json()).error).toContain('Too many requests');
  });
  it('enforces the 200-call daily quota and reads it without consuming requests',async()=>{
    const id=randomUUID();expect((await dailyAiRemaining(id))?.remaining).toBe(200);
    for(let i=0;i<200;i++)await enforceRateLimit('dailyAi',id);
    expect((await dailyAiRemaining(id))?.remaining).toBe(0);await expect(enforceRateLimit('dailyAi',id)).rejects.toMatchObject({status:429,kind:'dailyAi'});
  },30000);
  it('fails closed when credentials are missing',async()=>{
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN','');await expect(enforceRateLimit('ai',randomUUID())).rejects.toBeInstanceOf(RateLimitUnavailableError);expect(await dailyAiRemaining(randomUUID())).toBeNull();
  });
});
