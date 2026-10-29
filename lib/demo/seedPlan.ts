import Papa from 'papaparse';
import {z} from 'zod';
import type {CostRow} from '@/lib/import/schema';
export const DEMO_PROJECTS=['CodeAudit – Final Year Project','Sample – Marketing event'] as const;
export const DEMO_TAG='costlens-public-demo-v1';
export const DEMO_FIXTURES=['codeaudit.csv','codeaudit-msproject.xml','codeaudit-invoice.pdf','codeaudit-meeting.mp3','codeaudit-media-transcript.json'] as const;
export const MARKETING_COSTS=[['Venue hire','Planning','Venue',500,550],['Flyer design','Promotion','Design',180,175],['Refreshments','Event day','Catering',120,135]] as const;
export function demoCodeAuditCsv(existing:string){
 const parsed=Papa.parse<Record<string,string>>(existing,{header:true,skipEmptyLines:true});if(parsed.errors.length)throw new Error('The existing CSV fixture is invalid.');
 const rows=parsed.data.map(row=>row.Item==='AI API'?{...row,Actual:'1600'}:row);
 for(let index=0;index<12;index++)rows.push({Item:`Audit check ${index+1}`,Group:'Build',Category:'Tools',Estimated:'100',Actual:String(95+index),Currency:'USD',Date:`2026-10-${String(index+4).padStart(2,'0')}`});
 rows.push(...[0,1].map(()=>({Item:'Duplicate licence',Group:'Admin',Category:'Tools',Estimated:'30',Actual:'30',Currency:'USD',Date:'2026-10-20'})),{Item:'Unplanned support',Group:'Admin',Category:'Support',Estimated:'',Actual:'75',Currency:'USD',Date:'2026-10-21'});
 return Papa.unparse(rows);
}
/** Automatic confirmation is restricted to the known synthetic amounts, never arbitrary AI output. */
export function confirmDemoAmounts(rows:CostRow[],expected:readonly {estimated:number|null;actual:number|null}[]){
 const pairs=(input:readonly {estimated:number|null;actual:number|null}[])=>input.map(row=>JSON.stringify([row.estimated,row.actual])).sort();
 if(JSON.stringify(pairs(rows))!==JSON.stringify(pairs(expected)))throw new Error('Extracted amounts differ from the synthetic source. Review the import instead of seeding guessed data.');
}
export const seedConfigSchema=z.object({url:z.url(),supabaseUrl:z.url(),anon:z.string().min(1),service:z.string().min(1),email:z.email(),password:z.string().min(16).max(128),workerUrl:z.url()}).superRefine((value,ctx)=>{for(const key of ['url','supabaseUrl','workerUrl'] as const){const url=new URL(value[key]);if(url.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(url.hostname))ctx.addIssue({code:'custom',path:[key],message:'Use HTTPS outside localhost.'});if(url.username||url.password||url.search||url.hash||url.pathname!=='/')ctx.addIssue({code:'custom',path:[key],message:'Use an origin without credentials, path, query or fragment.'});}});
