import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ImportError } from './errors';
let initialized:Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')>|undefined;
async function pdfjs(){
  return initialized??= (async()=>{
    const canvas=await import('@napi-rs/canvas');
    Object.assign(globalThis,{DOMMatrix:canvas.DOMMatrix,ImageData:canvas.ImageData,Path2D:canvas.Path2D});
    const lib=await import('pdfjs-dist/legacy/build/pdf.mjs');
    lib.GlobalWorkerOptions.workerSrc=pathToFileURL(join(process.cwd(),'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs')).href;
    return lib;
  })();
}
export async function readPdf(bytes:Buffer,thumbnails=false){
  const lib=await pdfjs();
  const root=join(process.cwd(),'node_modules/pdfjs-dist');
  const task=lib.getDocument({data:Uint8Array.from(bytes),useSystemFonts:true,useWorkerFetch:false,standardFontDataUrl:join(root,'standard_fonts')+'/',cMapUrl:join(root,'cmaps')+'/',cMapPacked:true});
  const doc=await task.promise.catch(()=>{throw new ImportError('This PDF is encrypted, damaged or unsupported. Upload an unencrypted export.');});
  try{
    if(doc.numPages>20)throw new ImportError('PDFs may contain at most 20 pages. Split this PDF before importing.',413);
    const pages:{sourceRef:string;text:string;thumbnail?:string}[]=[];
    for(let n=1;n<=doc.numPages;n++){
      const page=await doc.getPage(n),content=await page.getTextContent();
      const text=content.items.map(item=>'str' in item?item.str+('hasEOL' in item&&item.hasEOL?'\n':' '):'').join('').trim();
      let thumbnail:string|undefined;
      if(thumbnails){
        const base=page.getViewport({scale:1});
        if(!Number.isFinite(base.width*base.height)||base.width*base.height>40000000)throw new ImportError('A PDF page exceeds the 40-megapixel safety limit.',413);
        const viewport=page.getViewport({scale:Math.min(1,900/Math.max(base.width,base.height))});
        const {createCanvas}=await import('@napi-rs/canvas');const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
        await page.render({canvasContext:canvas.getContext('2d') as unknown as CanvasRenderingContext2D,viewport,canvas:canvas as unknown as HTMLCanvasElement}).promise;
        thumbnail='data:image/jpeg;base64,'+canvas.toBuffer('image/jpeg').toString('base64');
      }
      pages.push({sourceRef:`page ${n}`,text,...(thumbnail?{thumbnail}:{})});page.cleanup();
    }
    return {pages,units:doc.numPages};
  }finally{await task.destroy();}
}
