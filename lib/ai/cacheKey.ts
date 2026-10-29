import { createHash } from 'node:crypto';
export function canonicalJson(value:unknown):string{
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';
  return '{'+Object.keys(value).sort().filter(key=>(value as Record<string,unknown>)[key]!==undefined).map(key=>JSON.stringify(key)+':'+canonicalJson((value as Record<string,unknown>)[key])).join(',')+'}';
}
export function aiCacheKey(task:string,model:string,input:unknown){return createHash('sha256').update(canonicalJson(['costlens-gemini-v1',task,model,input])).digest('hex');}
