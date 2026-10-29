import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { inspectZip, rejectDTD } from '@/lib/security/fileGuard';
import { applyMapping, fields, suggestMapping } from './mapping';
import { costRowSchema, type CostRow, type RawTable, type ParseOptions } from './schema';
import { ImportError } from './errors';
import { tableFromMatrix } from './table';
export class NoCostsFound extends ImportError {constructor(){super('No cost line items were found. Try a clearer document or enter the costs manually.');}}
export const MAX_DOCUMENT_UNITS=20;
export function fileHash(bytes:Buffer){return createHash('sha256').update(bytes).digest('hex');}
export function documentZip(bytes:Buffer){inspectZip(bytes);return unzipSync(bytes);}
export function safeXml(text:string){rejectDTD(text);return new XMLParser({ignoreAttributes:false,processEntities:false,removeNSPrefix:true}).parse(text);}
export function checkUnits(units:number,options?:ParseOptions){
  if(units>MAX_DOCUMENT_UNITS)throw new ImportError('Documents may contain at most 20 pages, slides or attachment units. Split this file.',413);
  if(units>5&&!options?.confirmAi)throw new ImportError('Confirm the AI estimate before extracting more than 5 pages or images.',409);
}
export function docxUnits(zip:Record<string,Uint8Array>){
  const xml=Buffer.from(zip['word/document.xml']).toString('utf8');
  const app=Buffer.from(zip['docProps/app.xml']??[]).toString('utf8');
  const declared=Number(app.match(/<(?:\w+:)?Pages>(\d+)<\/(?:\w+:)?Pages>/)?.[1]??1);
  return Math.max(1,declared,(xml.match(/w:type=["']page["']/g)?.length??0)+1,(xml.match(/<w:lastRenderedPageBreak\b/g)?.length??0)+1,Math.ceil(xml.replace(/<[^>]+>/g,'').length/3000));
}
export function estimateExtraction(units:number,kind:string,visual=false){
  if(units>20)throw new ImportError('Documents may contain at most 20 pages, slides or attachment units. Split this file.',413);
  const inputTokens=Math.max(1,units)*(visual?2000:1500),outputTokens=Math.min(8192,Math.max(1,units)*600);
  // Rough planning assumptions only; actual model prices and tokens can differ.
  const label:Record<string,string>={docx:'estimated pages',pdf:'pages',pptx:'slides',image:'images',png:'images',jpeg:'images',webp:'images',heic:'images',email:'body / attachment pages',eml:'body / attachment pages',msg:'body / attachment pages','web text':'estimated text pages'};
  return {units:Math.max(1,units),kind:label[kind]??kind,inputTokens,outputTokens,estimatedUsd:Number(((inputTokens*.5+outputTokens*3)/1e6).toFixed(4)),visual};
}
export async function extractText(projectId:string|undefined,segments:{sourceRef:string;text:string}[],currency='USD'){
  const nonempty=segments.filter(segment=>segment.text.trim()).map(({sourceRef,text})=>({sourceRef,text}));if(!nonempty.length)return [];
  if(!projectId)throw new ImportError('Open this document inside a project before using AI extraction.');
  if(nonempty.reduce((n,s)=>n+Buffer.byteLength(s.text,'utf8'),0)>700000)throw new ImportError('The extracted document text is too long. Split this document.',413);
  const {extractCosts}=await import('@/lib/ai/tasks/extractCosts');
  return extractCosts({projectId,segments:nonempty,currency});
}
export function asDocumentTable(rows:CostRow[],bytes:Buffer,sourceType:string,fileName:string,previews:NonNullable<RawTable['meta']['previews']>,units=1,visual=false,warnings:string[]=[]):RawTable{
  if(!rows.length)throw new NoCostsFound();
  if(rows.length>5000)throw new ImportError('This document has more than 5,000 cost rows. Split it into smaller files.');
  return {columns:[...fields],rows:rows.map(row=>({...costRowSchema.parse(row)})),meta:{sourceType,fileName,fileHash:fileHash(bytes),ai:true,previews:previews.slice(0,40),estimate:estimateExtraction(units,sourceType,visual),warnings}};
}
export function structuredRows(matrix:string[][],sourceRef:string,currency='USD'):CostRow[]{
  if(matrix.length<2)return [];
  const raw=tableFromMatrix(matrix,{sourceType:'document-table',fileName:'table',warnings:[]});
  const mapping=suggestMapping(raw.columns).mapping;
  if(!mapping.item||!mapping.estimated&&!mapping.actual)return [];
  const result=applyMapping(raw,mapping,{currency});
  // Partial structured recognition must not silently discard malformed or ambiguous rows.
  if(result.errors.length)return [];
  return result.rows.map((row,index)=>({...row,confidence:1,sourceRef:`${sourceRef}: row ${index+2}`}));
}
export function htmlDocument(html:string,sourceRef:string,currency='USD'){
  const $=cheerio.load(html);$('script,style,noscript,iframe,object,template,img').remove();
  const original=$.root().text().slice(0,50000);
  const rows:CostRow[]=[];
  $('table').filter((_,table)=>$(table).parents('table').length===0).each((index,table)=>{
    const matrix=$(table).find('tr').map((_,tr)=>[$(tr).children('th,td').map((_,cell)=>$(cell).text().replace(/\s+/g,' ').trim()).get()]).get() as string[][];
    const structured=structuredRows(matrix,`${sourceRef}: table ${index+1}`,currency);
    if(structured.length){rows.push(...structured);$(table).remove();}
  });
  $('p,div,li,br,h1,h2,h3,tr').append('\n');
  return {rows,original,text:$.root().text().replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim()};
}
