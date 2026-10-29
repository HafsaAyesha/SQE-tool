import * as cheerio from 'cheerio';
import { parseHtmlTables } from './htmlTable';
import { decodeText } from '@/lib/security/fileGuard';
import { asDocumentTable,estimateExtraction,extractText } from './document';
import { ImportError } from './errors';
import type { ParseOptions } from './schema';
export class HtmlConfirmation extends ImportError {
  constructor(public estimate:ReturnType<typeof estimateExtraction>){super('Confirm AI extraction for this page.',409);}
}
export async function parseHtmlSource(bytes:Buffer,options?:ParseOptions){
  const $=cheerio.load(decodeText(bytes));
  if($('table').length)return parseHtmlTables(bytes,options?.tableIndex);
  if(!options?.projectId)throw new ImportError('No HTML tables were found on this page. Open it in a project to extract readable text with AI.');
  $('script,style,noscript,iframe,object,template,img,nav,footer,header').remove();
  $('p,div,li,br,h1,h2,h3').append('\n');const text=$('body').text().replace(/[ \t]+/g,' ').trim();
  const units=Math.max(1,Math.ceil(text.length/3000)),estimate=estimateExtraction(units,'web text');
  if(!options.confirmAi)throw new HtmlConfirmation(estimate);
  const rows=await extractText(options.projectId,[{sourceRef:'web page',text}],options.currency);
  return asDocumentTable(rows,bytes,'html','web-page.html',[{sourceRef:'web page',text:text.slice(0,50000)}],units);
}
