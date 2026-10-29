import * as cheerio from 'cheerio';
import { documentZip } from './document';
import { ImportError } from './errors';
export function readSlides(bytes:Buffer){
  const zip=documentZip(bytes);
  const presentation=cheerio.load(Buffer.from(zip['ppt/presentation.xml']).toString('utf8'),{xml:true});
  const rels=cheerio.load(Buffer.from(zip['ppt/_rels/presentation.xml.rels']??[]).toString('utf8'),{xml:true});
  const targets=new Map(rels('Relationship').toArray().filter(rel=>rels(rel).attr('TargetMode')!=='External').map(rel=>[rels(rel).attr('Id'),rels(rel).attr('Target')]));
  const files=presentation('p\\:sldId').toArray().map(id=>targets.get(presentation(id).attr('r:id'))).filter((name):name is string=>Boolean(name)).map(name=>name.startsWith('/')?name.slice(1):'ppt/'+name);
  if(!files.length)throw new ImportError('No slides were found in this presentation.');
  if(files.length>20)throw new ImportError('Presentations may contain at most 20 slides.',413);
  return files.map((name,index)=>{
    if(!zip[name]||name.split('/').includes('..'))throw new ImportError('The presentation has an invalid slide reference.');
    const $=cheerio.load(Buffer.from(zip[name]).toString('utf8'),{xml:true});
    const original=$('a\\:t').map((_,node)=>$(node).text()).get().join('\n');
    const tables=$('a\\:tbl').toArray().map(table=>$(table).find('a\\:tr').toArray().map(row=>$(row).find('a\\:tc').toArray().map(cell=>$(cell).find('a\\:t').map((_,node)=>$(node).text()).get().join(' '))));
    $('a\\:tbl').remove();
    return {sourceRef:`slide ${index+1}`,text:$('a\\:t').map((_,node)=>$(node).text()).get().join('\n'),original,tables};
  });
}
