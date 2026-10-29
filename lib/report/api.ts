import 'server-only';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {requireProject} from '@/lib/supabase/requireProject';
import {enforceRateLimit,rateLimitResponse} from '@/lib/security/rateLimit';
import {AiError} from '@/lib/ai/errors';
import {reportOptions} from './options';
import {loadReport} from './load';
type Context={params:Promise<{id:string}>};
export async function downloadReport(request:Request,context:Context,format:'pdf'|'xlsx'|'csv'){
 try{
  const {id}=await context.params,project=await requireProject(id);await enforceRateLimit('report',project.owner_id);
  const options=reportOptions(new URL(request.url).searchParams);if(format==='csv')options.includeAi=false;
  const model=await loadReport(id,options);let bytes:Uint8Array;let mime:string;
  if(format==='csv'){const {reportCsv}=await import('./csv');bytes=Buffer.from(reportCsv(model),'utf8');mime='text/csv; charset=utf-8';}
  else if(format==='xlsx'){const {reportWorkbook}=await import('./excel');bytes=new Uint8Array(await reportWorkbook(model).xlsx.writeBuffer());mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';}
  else{const [{reportPdf},{reportChartImages}]=await Promise.all([import('./pdf'),import('./charts')]);bytes=Uint8Array.from(await reportPdf(model,await reportChartImages(model)));mime='application/pdf';}
  return new NextResponse(Uint8Array.from(bytes),{headers:{'Content-Type':mime,'Content-Disposition':`attachment; filename="costlens-${id}.${format}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){console.error('Report request failed',{type:error instanceof Error?error.name:'unknown'});const limited=rateLimitResponse(error);if(limited)return limited;const missing=typeof error==='object'&&error&&'digest'in error&&error.digest==='NEXT_HTTP_ERROR_FALLBACK;404';return NextResponse.json({error:missing?'Project not found.':error instanceof AiError?error.message:error instanceof z.ZodError?'The report options are invalid.':'The report could not be generated. Please try again.'},{status:missing?404:error instanceof AiError?error.status:error instanceof z.ZodError?400:503,headers:{'Cache-Control':'private, no-store',...(error instanceof AiError&&error.retryAfter?{'Retry-After':String(error.retryAfter)}:{})}});}
}
