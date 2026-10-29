import { guardedAdapter } from '@/lib/security/fileGuard';
import { inputBytes,inputName } from '../table';
import { asDocumentTable,checkUnits,docxUnits,documentZip,extractText,htmlDocument } from '../document';
export const docxAdapter=guardedAdapter({id:'docx',label:'Word document',icon:'FileText',kind:'ai',accepts:{extensions:['.docx'],mimeTypes:['application/vnd.openxmlformats-officedocument.wordprocessingml.document']},async parse(input,options){
  const bytes=await inputBytes(input),zip=documentZip(bytes);
  const units=docxUnits(zip);checkUnits(units,options);
  const mammoth=await import('mammoth');
  const result=await mammoth.convertToHtml({buffer:bytes},{convertImage:mammoth.images.imgElement(async()=>({src:''}))});
  const parsed=htmlDocument(result.value,'document',options?.currency);
  const extra=await extractText(options?.projectId,[{sourceRef:'document: text',text:parsed.text}],options?.currency);
  return asDocumentTable([...parsed.rows,...extra],bytes,'docx',inputName(input,options),[{sourceRef:'document',text:parsed.original}],units,false,result.messages.length?['Word formatting was simplified. Compare extracted rows with the original document.']:[]);
}},['docx']);
