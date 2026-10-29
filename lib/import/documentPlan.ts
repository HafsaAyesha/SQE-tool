import { inspectFile } from '@/lib/security/fileGuard';
import { documentZip,docxUnits,estimateExtraction } from './document';
import { readPdf } from './pdfDocument';
import { readSlides } from './slideDocument';
import { readEmail } from './emailDocument';
import { prepareImage } from './adapters/image';
import { ImportError } from './errors';
import type { ParseOptions } from './schema';
export async function documentPlan(input:File|Buffer|string,options:ParseOptions={}):Promise<ReturnType<typeof estimateExtraction>>{
  const file=await inspectFile(input,options);let units=1,visual=false;
  switch(file.format){
    case 'pdf':{const pdf=await readPdf(file.bytes);units=pdf.units;visual=pdf.pages.some(page=>!page.text.trim());break;}
    case 'docx':units=docxUnits(documentZip(file.bytes));break;
    case 'pptx':units=readSlides(file.bytes).length;break;
    case 'png':case 'jpeg':case 'webp':case 'heic':await prepareImage(file.bytes);visual=true;break;
    case 'eml':case 'msg':{
      const email=await readEmail(file.bytes,file.format);
      units=Math.max(1,Math.ceil((email.text.length||email.html.replace(/<[^>]+>/g,'').length)/3000));
      if(email.attachments.length>20)throw new ImportError('This email has too many attachments. Import attachments separately.',413);
      if(options.depth&&email.attachments.length)throw new ImportError('Nested email attachments are not supported. Import them separately.');
      if(Buffer.byteLength(email.text+email.html)>700000)throw new ImportError('This email body is too long. Split it before importing.',413);
      for(const attachment of email.attachments){const plan=await documentPlan(attachment.bytes,{fileName:attachment.name,mimeType:attachment.mimeType,depth:1});units+=plan.units;visual||=plan.visual;}
      break;
    }
  }
  return estimateExtraction(units,file.format,visual);
}
