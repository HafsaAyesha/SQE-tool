import 'server-only';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import type { Redis } from '@upstash/redis';
import { createRedisClient } from './redis';
import { Ratelimit } from '@upstash/ratelimit';
import { NextResponse } from 'next/server';
export type LimitKind='ai'|'import'|'login'|'dailyAi';
export class RateLimitError extends Error {
  readonly status=429;
  constructor(public retryAfter:number,public kind:LimitKind){super(kind==='dailyAi'?'Your daily AI quota is used up. Please try again tomorrow.':'Too many requests. Please wait a little and try again.');this.name='RateLimitError';}
}
export class RateLimitUnavailableError extends Error {readonly status=503;constructor(){super('Request limits are temporarily unavailable. Please try again shortly.');this.name='RateLimitUnavailableError';}}
let cached:{url:string;token:string;limiters:ReturnType<typeof createLimiters>}|undefined;
export function createLimiters(redis:Redis){
  const options={redis,analytics:false,ephemeralCache:false as const,timeout:0};
  return {
    ai:new Ratelimit({...options,prefix:'costlens:v1:ai',limiter:Ratelimit.slidingWindow(20,'10 m')}),
    import:new Ratelimit({...options,prefix:'costlens:v1:import',limiter:Ratelimit.slidingWindow(30,'10 m')}),
    login:new Ratelimit({...options,prefix:'costlens:v1:login',limiter:Ratelimit.slidingWindow(10,'10 m')}),
    dailyAi:new Ratelimit({...options,prefix:'costlens:v1:daily-ai',limiter:Ratelimit.fixedWindow(200,'1 d')}),
  };
}
function limiters(){
  const url=process.env.UPSTASH_REDIS_REST_URL,token=process.env.UPSTASH_REDIS_REST_TOKEN;
  if(!url||!token)throw new RateLimitUnavailableError();
  if(!cached||cached.url!==url||cached.token!==token){
    const redis=createRedisClient(url,token);
    cached={url,token,limiters:createLimiters(redis)};
  }
  return cached.limiters;
}
const identifier=(value:string)=>createHash('sha256').update(value).digest('hex');
export async function enforceRateLimit(kind:LimitKind,id:string){
  if(!id)throw new RateLimitUnavailableError();
  try {
    const result=await limiters()[kind].limit(identifier(id));
    if(!result.success)throw new RateLimitError(Math.max(1,Math.ceil((result.reset-Date.now())/1000)),kind);
    await result.pending;
    return {remaining:result.remaining,reset:result.reset,limit:result.limit};
  }catch(error){if(error instanceof RateLimitError)throw error;throw new RateLimitUnavailableError();}
}
export async function enforceAiLimits(userId:string){await enforceRateLimit('ai',userId);return enforceRateLimit('dailyAi',userId);}
export async function dailyAiRemaining(userId:string){
  try {const result=await limiters().dailyAi.getRemaining(identifier(userId));return {remaining:Math.max(0,result.remaining),limit:200,reset:result.reset};}
  catch {return null;}
}
export function loginIdentifier(headers:Headers){
  const trusted=process.env.VERCEL==='1'||process.env.TRUST_PROXY_HEADERS==='true';
  const raw=trusted?(headers.get('x-vercel-forwarded-for')??headers.get('x-forwarded-for'))?.split(',')[0].trim():undefined;
  if(!raw||!isIP(raw))return 'unknown-client';
  return ipaddr.process(raw).toNormalizedString();
}
export function rateLimitResponse(error:unknown){
  if(error instanceof RateLimitError)return NextResponse.json({error:error.message,retryAfter:error.retryAfter},{status:429,headers:{'Retry-After':String(error.retryAfter),'Cache-Control':'private, no-store'}});
  if(error instanceof RateLimitUnavailableError)return NextResponse.json({error:error.message},{status:503,headers:{'Cache-Control':'private, no-store'}});
  return null;
}
