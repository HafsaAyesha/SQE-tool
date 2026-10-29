import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createServer,type Server,type RequestListener} from 'node:http';
import {createGateway,readGatewayConfig} from '../../worker/src/gateway';
import {signMedia,verifyMedia} from '@/shared/mediaProtocol';
vi.mock('server-only',()=>({}));
import {dispatchMediaJob,requireWorkerConfig} from '@/lib/media/server';
const secret='synthetic-test-secret-at-least-32-characters',jobId='11111111-1111-4111-8111-111111111111';
const servers:Server[]=[];
async function listen(app:RequestListener){const server=createServer(app);servers.push(server);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));return `http://127.0.0.1:${(server.address() as {port:number}).port}`;}
let received:{url:string;headers:Record<string,string|undefined>;body:{jobId:string;timestamp:number}}[]=[];
beforeEach(()=>{received=[];vi.stubEnv('WORKER_SECRET',secret);vi.stubEnv('WORKER_SERVICE_URL',undefined);vi.stubEnv('WORKER_URL',undefined);});
afterEach(async()=>{vi.unstubAllEnvs();await Promise.all(servers.splice(0).map(server=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());})));});
async function processor(mode:'ok'|'error'|'redirect'='ok'){
 return listen(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks).toString();
  if(req.url==='/processor/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,active:1}));return;}
  received.push({url:req.url!,headers:{authorization:req.headers.authorization,cookie:req.headers.cookie,signature:req.headers['x-costlens-signature'] as string},body:body?JSON.parse(body):{}});
  if(mode==='error'){res.statusCode=500;res.end('sensitive-upstream-details');return;}
  if(mode==='redirect'){res.statusCode=302;res.setHeader('Location','/unexpected');res.end();return;}
  const parsed=JSON.parse(body);if(!verifyMedia(parsed.jobId,parsed.timestamp,req.headers['x-costlens-signature'] as string,secret)){res.statusCode=401;res.end();return;}
  res.statusCode=202;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({accepted:true}));
 });
}
async function gateway(){const app=createGateway();return (await listen((req,res)=>{if(!req.url?.startsWith('/binding/')){res.statusCode=404;res.end();return;}req.url=req.url.slice('/binding'.length);app(req,res);}))+'/binding';}
const signedBody=()=>{const timestamp=Math.floor(Date.now()/1000);return {timestamp,body:JSON.stringify({jobId,timestamp}),signature:signMedia(jobId,timestamp,secret)};};
it('dispatches app → bound internal gateway → Render with preserved base prefixes and valid HMAC',async()=>{
 const render=await processor();vi.stubEnv('WORKER_URL',render+'/processor');const binding=await gateway();vi.stubEnv('WORKER_SERVICE_URL',binding);
 expect(requireWorkerConfig().url.href).toBe(binding);await dispatchMediaJob(jobId);expect(received).toHaveLength(1);expect(received[0].url).toBe('/processor/jobs');expect(received[0].body.jobId).toBe(jobId);
 expect(verifyMedia(jobId,received[0].body.timestamp,received[0].headers.signature!,secret)).toBe(true);
});
it('forwards only the signed job protocol, never browser credentials',async()=>{
 vi.stubEnv('WORKER_URL',(await processor())+'/processor');const binding=await gateway(),signed=signedBody();
 const response=await fetch(binding+'/jobs',{method:'POST',headers:{'Content-Type':'application/json','x-costlens-signature':signed.signature,Authorization:'Bearer synthetic-do-not-forward',Cookie:'synthetic-session=private'},body:signed.body});
 expect(response.status).toBe(202);expect(await response.json()).toEqual({accepted:true});expect(received[0].headers.authorization).toBeUndefined();expect(received[0].headers.cookie).toBeUndefined();
});
it('rejects unsigned, expired, malformed and oversized jobs before contacting the processor',async()=>{
 vi.stubEnv('WORKER_URL',(await processor())+'/processor');const binding=await gateway(),signed=signedBody();
 for(const [body,signature,status] of [[signed.body,'',401],[JSON.stringify({jobId,timestamp:signed.timestamp-301}),signMedia(jobId,signed.timestamp-301,secret),401],[JSON.stringify({jobId,timestamp:signed.timestamp,url:'http://169.254.169.254'}),signed.signature,400],['{',signed.signature,400],[JSON.stringify({data:'x'.repeat(3000)}),signed.signature,413]] as const){const response=await fetch(binding+'/jobs',{method:'POST',headers:{'Content-Type':'application/json','x-costlens-signature':signature},body});expect(response.status).toBe(status);expect(await response.text()).not.toContain('stack');}
 expect(received).toHaveLength(0);
});
it('relays bounded health without starting ffmpeg, requiring OpenAI credentials or exposing unrelated routes',async()=>{
 vi.stubEnv('OPENAI_API_KEY',undefined);vi.stubEnv('WORKER_URL',(await processor())+'/processor');const binding=await gateway();
 const response=await fetch(binding+'/health');expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,active:1});expect(response.headers.get('Cache-Control')).toBe('private, no-store');expect(response.headers.has('X-Powered-By')).toBe(false);
 expect((await fetch(binding+'/api/media/worker')).status).toBe(404);expect(received).toHaveLength(0);
});
it('fails closed on upstream errors/redirects and does not reveal processor responses',async()=>{
 for(const mode of ['error','redirect'] as const){vi.stubEnv('WORKER_URL',(await processor(mode))+'/processor');const binding=await gateway(),signed=signedBody();const response=await fetch(binding+'/jobs',{method:'POST',headers:{'Content-Type':'application/json','x-costlens-signature':signed.signature},body:signed.body});expect(response.status).toBe(503);const text=await response.text();expect(text).not.toContain('sensitive-upstream-details');expect(text).not.toContain('stack');expect(text).toContain('remains queued');}
 expect(received).toHaveLength(2);expect(received.every(call=>call.url==='/processor/jobs')).toBe(true);
});
it('reads the service binding only at runtime and preserves HTTPS checks for the legacy Render URL',()=>{
 vi.stubEnv('WORKER_URL','https://processor.example');expect(requireWorkerConfig().url.hostname).toBe('processor.example');
 vi.stubEnv('WORKER_SERVICE_URL','http://worker.internal/service-prefix');expect(requireWorkerConfig().url.href).toBe('http://worker.internal/service-prefix');expect(readGatewayConfig().url.hostname).toBe('processor.example');
 vi.stubEnv('WORKER_SERVICE_URL',undefined);vi.stubEnv('WORKER_URL','http://public.example');expect(()=>requireWorkerConfig()).toThrow(/invalid/);expect(()=>readGatewayConfig()).toThrow(/Invalid/);
 vi.stubEnv('WORKER_SERVICE_URL','file:///etc/passwd');expect(()=>requireWorkerConfig()).toThrow(/invalid/);
});
it('loads the Vercel entrypoint without runtime secrets or a background polling loop',async()=>{
 vi.stubEnv('OPENAI_API_KEY',undefined);vi.stubEnv('WORKER_URL',undefined);vi.stubEnv('WORKER_SECRET',undefined);const interval=vi.spyOn(globalThis,'setInterval');
 try{const entry=await import('../../worker/src/app');expect(typeof entry.default).toBe('function');expect(interval).not.toHaveBeenCalled();}finally{interval.mockRestore();}
});
