import { guardedAdapter } from '@/lib/security/fileGuard';
import { inputBytes,inputName } from '../table';
import { asDocumentTable,checkUnits,extractText } from '../document';
import { readPdf } from '../pdfDocument';
import { ImportError } from '../errors';
export const pdfAdapter=guardedAdapter({id:'pdf',label:'PDF document',icon:'FileText',kind:'ai',accepts:{extensions:['.pdf'],mimeTypes:['application/pdf']},async parse(input,options){
  const bytes=await inputBytes(input),parsed=await readPdf(bytes,true);checkUnits(parsed.units,options);
  let rows=parsed.pages.every(page=>page.text.trim())?await extractText(options?.projectId,parsed.pages,options?.currency):[];
  let visual=false;
  if(!rows.length){
    if(!options?.projectId)throw new ImportError('Open this PDF inside a project before extracting costs.');
    const {extractCosts}=await import('@/lib/ai/tasks/extractCosts');
    rows=await extractCosts({projectId:options.projectId,currency:options.currency,media:[{mimeType:'application/pdf',data:bytes,sourceRef:'page'}]});visual=true;
    if(rows.some(row=>Number(row.sourceRef?.match(/^page (\d+)/)?.[1])>parsed.units))throw new ImportError('AI referenced a page outside this PDF. Try again.');
  }
  return asDocumentTable(rows,bytes,'pdf',inputName(input,options),parsed.pages,parsed.units,visual);
}},['pdf']);
