import { simpleParser } from 'mailparser';
import { ImportError } from './errors';
export type EmailDocument={text:string;html:string;attachments:{name:string;bytes:Buffer;mimeType:string}[]};
export async function readEmail(bytes:Buffer,format:'eml'|'msg'):Promise<EmailDocument>{
  if(format==='eml'){
    const parsed=await simpleParser(bytes,{skipHtmlToText:true,skipTextToHtml:true,skipImageLinks:true,maxHtmlLengthToParse:1024*1024});
    return {text:parsed.text??'',html:typeof parsed.html==='string'?parsed.html:'',attachments:parsed.attachments.map((attachment,index)=>({name:attachment.filename??`attachment-${index+1}.bin`,bytes:attachment.content,mimeType:attachment.contentType}))};
  }
  const mod=await import('@kenjiuno/msgreader');const MsgReader=mod.default;
  const reader=new MsgReader(Uint8Array.from(bytes).buffer);
  const data=reader.getFileData();if(data.error)throw new ImportError('This Outlook message could not be read. Export it as EML and retry.');
  const attachments=(data.attachments??[]).map((attachment,index)=>{const file=reader.getAttachment(attachment);return {name:file.fileName??`attachment-${index+1}.bin`,bytes:Buffer.from(file.content),mimeType:'application/octet-stream'};});
  return {text:data.body??'',html:typeof data.bodyHtml==='string'?data.bodyHtml:'',attachments};
}
