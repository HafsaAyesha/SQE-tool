import Link from 'next/link';
import {requireProject} from '@/lib/supabase/requireProject';
import {reportOptions} from '@/lib/report/options';
import {loadReport} from '@/lib/report/load';
import {PageHeader} from '@/components/costlens/PageHeader';
import {ReportPreview} from '@/components/costlens/ReportPreview';
export default async function ReportPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {id}=await params;await requireProject(id);const raw=await searchParams,query=new URLSearchParams(Object.entries(raw).flatMap(([key,value])=>value===undefined?[]:typeof value==='string'?[[key,value]]:value.map(part=>[key,part])));
 let options;try{options=reportOptions(query);}catch{return <><PageHeader title="Check report options" description="Some report filters or options are invalid."/><Link href={`/projects/${id}/report`} className="text-primary underline">Reset report options</Link></>;}
 const model=await loadReport(id,options,false);
 return <><PageHeader title="Project report" description="Review the report, choose sections and download a shareable copy."/><ReportPreview projectId={id} initial={model}/></>;
}
