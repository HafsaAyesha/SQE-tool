import sharp from 'sharp';
import { guardedAdapter } from '@/lib/security/fileGuard';
import { inputBytes,inputName } from '../table';
import { asDocumentTable } from '../document';
import { ImportError } from '../errors';
export async function prepareImage(bytes:Buffer){
  try{
    let source=bytes;
    if(bytes.subarray(4,8).toString()==='ftyp'){
      const decode=(await import('heic-decode')).default;const images=await decode.all({buffer:bytes});
      try{const first=images[0];if(!first||first.width*first.height>40000000)throw new ImportError('Images must be 40 megapixels or smaller.',413);const decoded=await first.decode();source=await sharp(Buffer.from(decoded.data),{raw:{width:decoded.width,height:decoded.height,channels:4}}).png().toBuffer();}finally{images.dispose();}
    }
    const image=sharp(source,{limitInputPixels:40000000,animated:false});
    const meta=await image.metadata();
    if(!meta.width||!meta.height||meta.width*meta.height>40000000)throw new ImportError('Images must be 40 megapixels or smaller.',413);
    const normalized=await image.rotate().resize({width:2000,height:2000,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).jpeg({quality:85}).toBuffer();
    const thumbnail=await sharp(normalized).resize({width:900,height:900,fit:'inside',withoutEnlargement:true}).jpeg({quality:75}).toBuffer();
    return {bytes:normalized,thumbnail:'data:image/jpeg;base64,'+thumbnail.toString('base64')};
  }catch(error){if(error instanceof ImportError)throw error;throw new ImportError('This image is unsupported or exceeds 40 megapixels. Export the image as JPEG or PNG and retry.');}
}
export const imageAdapter=guardedAdapter({id:'image',label:'Receipt / image',icon:'Image',kind:'ai',accepts:{extensions:['.png','.jpg','.jpeg','.webp','.heic'],mimeTypes:['image/png','image/jpeg','image/webp','image/heic']},async parse(input,options){
  const bytes=await inputBytes(input),image=await prepareImage(bytes);
  if(!options?.projectId)throw new ImportError('Open this image inside a project before extracting costs.');
  const {extractCosts}=await import('@/lib/ai/tasks/extractCosts');
  const rows=await extractCosts({projectId:options.projectId,currency:options.currency,media:[{mimeType:'image/jpeg',data:image.bytes,sourceRef:'image 1'}]});
  return asDocumentTable(rows,bytes,'image',inputName(input,options),[{sourceRef:'image 1',thumbnail:image.thumbnail}],1,true);
}},['png','jpeg','webp','heic']);
