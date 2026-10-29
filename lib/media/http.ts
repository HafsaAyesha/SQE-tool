import {z} from 'zod';
import {NextResponse} from 'next/server';
import {ImportError} from '@/lib/import/errors';
import {AiError} from '@/lib/ai/errors';
import {rateLimitResponse} from '@/lib/security/rateLimit';
export async function readMediaJson(request:Request,limit=16384){
 if(!request.headers.get('content-type')?.startsWith('application/json')||!request.body)throw new ImportError('Send media details as JSON.');
 if(Number(request.headers.get('content-length'))>limit)throw new ImportError('The media request is too large.',413);
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>limit){await reader.cancel();throw new ImportError('The media request is too large.',413);}chunks.push(part.value);}}finally{reader.releaseLock();}
 return Buffer.concat(chunks).toString('utf8');
}
export function mediaError(error:unknown,fallback='The media service is temporarily unavailable. Please try again.'){const limited=rateLimitResponse(error);if(limited)return limited;const missing=typeof error==='object'&&error&&'digest' in error&&error.digest==='NEXT_HTTP_ERROR_FALLBACK;404';const invalid=error instanceof z.ZodError||error instanceof SyntaxError;const status=missing?404:invalid?400:error instanceof ImportError||error instanceof AiError?error.status:503;return NextResponse.json({error:missing?'Project or recording not found.':invalid?'The media request is invalid.':error instanceof ImportError||error instanceof AiError?error.message:fallback},{status,headers:{'Cache-Control':'private, no-store',...(error instanceof AiError&&error.retryAfter?{'Retry-After':String(error.retryAfter)}:{})}});}
