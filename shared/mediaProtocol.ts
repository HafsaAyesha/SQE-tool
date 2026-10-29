import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
export function signMedia(jobId:string,timestamp:number,secret:string,purpose='jobs',body=''){
  const payload=`${purpose}\n${jobId}\n${timestamp}`+(body?'\n'+createHash('sha256').update(body).digest('hex'):'');
  return createHmac('sha256',secret).update(payload).digest('hex');
}
export function verifyMedia(jobId:string,timestamp:number,signature:string,secret:string,purpose='jobs',body='',now=Date.now()){
  if(secret.length<32||!Number.isSafeInteger(timestamp)||timestamp<Math.floor(now/1000)-300||timestamp>Math.floor(now/1000)+60||!/^[a-f0-9]{64}$/.test(signature))return false;
  return timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(signMedia(jobId,timestamp,secret,purpose,body),'hex'));
}
