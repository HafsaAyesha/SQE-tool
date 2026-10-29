import express from 'express';
import {z} from 'zod';
import {verifyMedia} from '../../shared/mediaProtocol.js';
import {readConfig,type WorkerConfig} from './config.js';
import {appCall} from './api.js';
import {processJob} from './process.js';
export function createWorker(config:WorkerConfig,process:(config:WorkerConfig,id:string)=>Promise<void>=processJob){
 const app=express(),active=new Set<string>();app.disable('x-powered-by');app.use(express.json({limit:'2kb'}));
 function enqueue(id:string){if(active.has(id)||active.size>=2)return;active.add(id);void process(config,id).catch(()=>console.error('Media job runner failed',{jobId:id})).finally(()=>active.delete(id));}
 app.get('/health',(_request,response)=>response.json({ok:true,active:active.size}));
 app.post('/jobs',(request,response)=>{const input=z.object({jobId:z.string().uuid(),timestamp:z.number().int()}).strict().safeParse(request.body);if(!input.success||!verifyMedia(input.data.jobId,input.data.timestamp,request.header('x-costlens-signature')??'',config.secret))return response.status(401).json({error:'Invalid or expired job signature.'});enqueue(input.data.jobId);return response.status(202).json({accepted:true});});
 async function poll(){try{const result=z.object({jobs:z.array(z.string().uuid()).max(10)}).parse(await appCall(config,'00000000-0000-4000-8000-000000000000','poll'));for(const id of result.jobs)enqueue(id);}catch{console.error('Media queue poll unavailable');}}
 app.use((_error:unknown,_request:express.Request,response:express.Response,_next:express.NextFunction)=>{void _next;response.status(400).json({error:'Invalid worker request.'});});
 return {app,poll,active};
}
if(process.env.NODE_ENV!=='test'){
 const config=readConfig(),worker=createWorker(config);worker.app.listen(config.port,'0.0.0.0',()=>console.log('CostLens media worker listening'));
 const timer=setInterval(()=>void worker.poll(),30000);timer.unref();void worker.poll();
}
