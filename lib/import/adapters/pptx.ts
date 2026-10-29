import { guardedAdapter } from '@/lib/security/fileGuard';
import { inputBytes,inputName } from '../table';
import { asDocumentTable,checkUnits,extractText,structuredRows } from '../document';
import { readSlides } from '../slideDocument';
export const pptxAdapter=guardedAdapter({id:'pptx',label:'PowerPoint slides',icon:'Presentation',kind:'ai',accepts:{extensions:['.pptx'],mimeTypes:['application/vnd.openxmlformats-officedocument.presentationml.presentation']},async parse(input,options){
  const bytes=await inputBytes(input),slides=readSlides(bytes);checkUnits(slides.length,options);
  const rows=slides.flatMap(slide=>slide.tables.flatMap((matrix,index)=>structuredRows(matrix,`${slide.sourceRef}: table ${index+1}`,options?.currency)));
  const segments=slides.map(slide=>({sourceRef:slide.sourceRef,text:[slide.text,...slide.tables.filter((matrix,index)=>!structuredRows(matrix,`${slide.sourceRef}: table ${index+1}`,options?.currency).length).map(matrix=>matrix.map(row=>row.join('\t')).join('\n'))].join('\n')}));
  const extra=await extractText(options?.projectId,segments,options?.currency);
  return asDocumentTable([...rows,...extra],bytes,'pptx',inputName(input,options),slides.map(slide=>({sourceRef:slide.sourceRef,text:slide.original})),slides.length);
}},['pptx']);
