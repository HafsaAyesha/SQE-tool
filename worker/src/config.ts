import {ProxyAgent} from 'undici';
export type WorkerConfig={appUrl:string;secret:string;openaiKey:string;port:number};
export function readConfig():WorkerConfig{
 const appUrl=process.env.APP_URL??'',secret=process.env.WORKER_SECRET??'',openaiKey=process.env.OPENAI_API_KEY??'';
 if(secret.length<32||!openaiKey)throw new Error('Configure WORKER_SECRET (32+ characters), OPENAI_API_KEY and APP_URL.');
 const url=new URL(appUrl);if(url.username||url.password||url.search||url.hash||url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('APP_URL must be your HTTPS CostLens origin.');
 return {appUrl:url.origin,secret,openaiKey,port:Number(process.env.PORT??3001)};
}
export async function request(url:string|URL,init:RequestInit={}){
 const target=new URL(url),proxyUrl=process.env.HTTPS_PROXY||process.env.https_proxy||process.env.HTTP_PROXY||process.env.http_proxy;
 const proxy=proxyUrl&&!['127.0.0.1','localhost'].includes(target.hostname)?new ProxyAgent(proxyUrl):undefined;
 try{return await fetch(target,{...init,redirect:'error',...(proxy?{dispatcher:proxy}:{})} as RequestInit);}finally{if(proxy)void proxy.close();}
}
export async function readBoundedJson(response:Response,limit=2*1024*1024):Promise<unknown>{
 if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw new Error('Provider response exceeds the safety limit.');}
 if(!response.body)throw new Error('Empty provider response.');const reader=response.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>limit){await reader.cancel();throw new Error('Provider response exceeds the safety limit.');}chunks.push(part.value);}}finally{reader.releaseLock();}
 return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
