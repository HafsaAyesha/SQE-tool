import express from 'express';
import {z} from 'zod';
import {verifyMedia} from '../../shared/mediaProtocol.js';
import {request,readBoundedJson} from './config.js';

type GatewayConfig={url:URL;secret:string};
/** Only the external Render processor belongs in WORKER_URL. Never relay to the service binding. */
export function readGatewayConfig():GatewayConfig{
 const value=process.env.WORKER_URL,secret=process.env.WORKER_SECRET;
 if(!value||!secret||secret.length<32)throw new Error('Configure the Render processor URL and shared worker secret.');
 const url=new URL(value),local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if(url.username||url.password||url.search||url.hash||url.protocol!=='https:'&&!(local&&url.protocol==='http:'))throw new Error('Invalid Render processor configuration.');
 return {url,secret};
}
function endpoint(base:URL,path:'jobs'|'health'){const directory=new URL(base);directory.pathname=directory.pathname.replace(/\/+$/,'')+'/';return new URL(path,directory);}
const jobSchema=z.object({jobId:z.string().uuid(),timestamp:z.number().int()}).strict();
const healthSchema=z.object({ok:z.literal(true),active:z.number().int().nonnegative().optional()}).strict();
const acceptedSchema=z.object({accepted:z.literal(true)}).strict();
export function createGateway(config:()=>GatewayConfig=readGatewayConfig){
 const app=express();app.disable('x-powered-by');
 app.use((_request,response,next)=>{response.set('Cache-Control','private, no-store');next();});app.use(express.json({limit:'2kb'}));
 app.get('/health',async(_request,response)=>{
  try{const {url}=config(),upstream=await request(endpoint(url,'health'),{signal:AbortSignal.timeout(8000)});if(!upstream.ok){await upstream.body?.cancel();throw new Error('Processor health unavailable');}return response.json(healthSchema.parse(await readBoundedJson(upstream,4096)));}
  catch(error){console.error('Worker gateway health unavailable',{type:error instanceof Error?error.name:'unknown'});return response.status(503).json({error:'The media processor is temporarily unavailable.'});}
 });
 app.post('/jobs',async(req,response)=>{
  const input=jobSchema.safeParse(req.body);if(!input.success)return response.status(400).json({error:'Invalid media job request.'});
  try{
   const {url,secret}=config(),signature=req.header('x-costlens-signature')??'';
   if(!verifyMedia(input.data.jobId,input.data.timestamp,signature,secret))return response.status(401).json({error:'Invalid or expired job signature.'});
   const upstream=await request(endpoint(url,'jobs'),{method:'POST',signal:AbortSignal.timeout(8000),headers:{'Content-Type':'application/json','x-costlens-signature':signature},body:JSON.stringify(input.data)});
   if(upstream.status!==202){await upstream.body?.cancel();throw new Error('Processor rejected the job');}
   return response.status(202).json(acceptedSchema.parse(await readBoundedJson(upstream,4096)));
  }catch(error){console.error('Worker gateway dispatch unavailable',{type:error instanceof Error?error.name:'unknown'});return response.status(503).json({error:'The media job could not be dispatched. It remains queued for the processor.'});}
 });
 app.use((_request,response)=>response.status(404).json({error:'Worker route not found.'}));
 app.use((error:{type?:string},_request:express.Request,response:express.Response,_next:express.NextFunction)=>{void _next;return response.status(error.type==='entity.too.large'?413:400).json({error:'Invalid worker request.'});});
 return app;
}
