import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticate } from '@/app/(auth)/actions';
const bodySchema=z.object({mode:z.enum(['login','signup']),email:z.string().max(254),password:z.string().max(128)}).strict();
export async function POST(request:Request){
  const headers={'Cache-Control':'private, no-store'};
  if(!request.headers.get('content-type')?.startsWith('application/json'))return NextResponse.json({error:'Send sign-in details as JSON.'},{status:400,headers});
  if(Number(request.headers.get('content-length'))>2048)return NextResponse.json({error:'Sign-in details are too large.'},{status:413,headers});
  let input:unknown;
  try{
    if(!request.body)throw new Error();const reader=request.body.getReader();const parts:Uint8Array[]=[];let length=0;
    try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>2048){await reader.cancel();return NextResponse.json({error:'Sign-in details are too large.'},{status:413,headers});}parts.push(part.value);}}finally{reader.releaseLock();}
    input=JSON.parse(Buffer.concat(parts).toString());
  }catch{return NextResponse.json({error:'Enter valid sign-in details.'},{status:400,headers});}
  const parsed=bodySchema.safeParse(input);if(!parsed.success)return NextResponse.json({error:'Enter valid sign-in details.'},{status:400,headers});
  const result=await authenticate(parsed.data.mode,{email:parsed.data.email,password:parsed.data.password},false);
  return NextResponse.json(result,{status:result.status??(result.error?401:200),headers:{...headers,...(result.retryAfter?{'Retry-After':String(result.retryAfter)}:{})}});
}
