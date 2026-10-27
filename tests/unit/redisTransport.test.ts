import{afterEach,expect,it,vi}from'vitest';
vi.mock('server-only',()=>({}));
import{createRedisClient}from'@/lib/security/redis';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it('keeps the managed proxy for public Redis, disables redirects and carries the consistency token',async()=>{
  vi.stubEnv('HTTPS_PROXY','http://proxy:8080');
  const fetch=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({result:'PONG'}),{headers:{'upstash-sync-token':'synthetic-sync'}}));
  const redis=createRedisClient('https://synthetic.upstash.example','synthetic-redis-token');expect(await redis.ping()).toBe('PONG');await redis.ping();
  const init=fetch.mock.calls[0][1] as RequestInit&{dispatcher?:unknown};expect(init.dispatcher).toBeDefined();expect(init.redirect).toBe('error');expect(init.signal).toBeDefined();expect((fetch.mock.calls[1][1]?.headers as Record<string,string>)['upstash-sync-token']).toBe('synthetic-sync');
});
it('requires HTTPS for non-loopback backends and does not follow redirects or return provider error bodies',async()=>{
  expect(()=>createRedisClient('http://public.example','token')).toThrow('Invalid Redis');
  const fetch=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('private-provider-error',{status:403}));
  await expect(createRedisClient('http://127.0.0.1:12345','token').ping()).rejects.toThrow('Redis is temporarily unavailable');expect(fetch.mock.calls[0][1]?.redirect).toBe('error');
});
