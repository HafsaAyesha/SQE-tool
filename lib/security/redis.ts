import 'server-only';
import { Redis, type Requester } from '@upstash/redis';
import { ProxyAgent } from 'undici';
/** Trusted server configuration only. Keep managed-proxy transport and TLS verification enabled. */
export function createRedisClient(url:string,token:string){
  const target=new URL(url),local=['127.0.0.1','localhost','[::1]'].includes(target.hostname);
  if(target.username||target.password||target.search||target.hash||(target.protocol!=='https:'&&!(local&&target.protocol==='http:')))throw new Error('Invalid Redis configuration');
  const proxyUrl=!local&&(process.env.HTTPS_PROXY||process.env.https_proxy||process.env.HTTP_PROXY||process.env.http_proxy);
  const dispatcher=proxyUrl?new ProxyAgent(proxyUrl):undefined;
  const requester:Requester={readYourWrites:true,upstashSyncToken:'',request:async<TResult>(request:Parameters<Requester['request']>[0])=>{
    const timeout=AbortSignal.timeout(2500);const signal=request.signal?AbortSignal.any([request.signal,timeout]):timeout;
    const response=await globalThis.fetch([url.replace(/\/$/,''),...(request.path??[])].join('/'),{method:'POST',headers:{'Content-Type':'application/json',...request.headers,Authorization:`Bearer ${token}`,'upstash-sync-token':requester.upstashSyncToken??''},body:JSON.stringify(request.body),signal,redirect:'error',cache:'no-store',...(dispatcher?{dispatcher}:{})} as RequestInit);
    if(!response.ok){
      // Upstash returns HTTP 400 for an uncached EVALSHA script. Preserve its
      // error code so the SDK can retry with EVAL; never expose provider details.
      if(response.status===400){
        const body:unknown=await response.json().catch(()=>null);
        if(body&&typeof body==='object'&&'error'in body&&typeof body.error==='string'&&/^NOSCRIPT\b/i.test(body.error))return {error:'NOSCRIPT Script is not loaded.'};
      }
      throw new Error('Redis is temporarily unavailable');
    }
    requester.upstashSyncToken=response.headers.get('upstash-sync-token')??'';
    return await response.json() as {result?:TResult;error?:string};
  }};
  return new Redis(requester);
}
