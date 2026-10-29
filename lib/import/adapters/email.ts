import { guardedAdapter,inspectFile } from '@/lib/security/fileGuard';
import { inputBytes,inputName } from '../table';
import { asDocumentTable,checkUnits,extractText,htmlDocument,NoCostsFound } from '../document';
import { readEmail } from '../emailDocument';
import { documentPlan } from '../documentPlan';
import { applyMapping,suggestMapping } from '../mapping';
import { ImportError } from '../errors';
export const emailAdapter=guardedAdapter({id:'email',label:'Email / Outlook message',icon:'Mail',kind:'ai',accepts:{extensions:['.eml','.msg'],mimeTypes:['message/rfc822','application/vnd.ms-outlook']},async parse(input,options){
  const bytes=await inputBytes(input),file=await inspectFile(input,options),plan=await documentPlan(input,options);checkUnits(plan.units,options);
  if(file.format!=='eml'&&file.format!=='msg')throw new ImportError('Choose an EML or MSG email.');
  const mail=await readEmail(bytes,file.format);const body=mail.html?htmlDocument(mail.html,'email body',options?.currency):{rows:[],text:mail.text};
  const rows=[...body.rows,...await extractText(options?.projectId,[{sourceRef:'email body',text:body.text}],options?.currency)];
  const previews:NonNullable<import('../schema').RawTable['meta']['previews']>=[{sourceRef:'email body',text:mail.text||body.text}];
  const warnings:string[]=[];
  const {getAdapterFor}=await import('../registry');
  for(const [index,attachment] of mail.attachments.entries()){
    const adapter=await getAdapterFor(attachment.bytes,{fileName:attachment.name,mimeType:attachment.mimeType});
    if(!adapter||adapter.kind==='online')throw new ImportError(`Attachment ${index+1} is not a supported document. Import it separately.`);
    let raw;
    try{raw=await adapter.parse(attachment.bytes,{...options,fileName:attachment.name,mimeType:attachment.mimeType,depth:1});}
    catch(error){if(error instanceof NoCostsFound){warnings.push(`Attachment ${index+1} contained no cost line items.`);continue;}throw error;}
    const mapped=applyMapping(raw,suggestMapping(raw.columns).mapping,{currency:options?.currency??'USD'});
    if(mapped.errors.length)throw new ImportError(`Attachment ${index+1} needs manual mapping. Import it separately.`);
    const prefix=`attachment ${index+1}`;
    rows.push(...mapped.rows.map(row=>({...row,confidence:row.confidence??1,sourceRef:`${prefix}: ${row.sourceRef??attachment.name}`})));
    previews.push(...(raw.meta.previews??[{sourceRef:attachment.name,text:'Structured attachment parsed locally.'}]).map(preview=>({...preview,sourceRef:`${prefix}: ${preview.sourceRef}`})));
  }
  return asDocumentTable(rows,bytes,'email',inputName(input,options),previews,plan.units,plan.visual,warnings);
}},['eml','msg']);
