'use client';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {anomalies} from '@/lib/costs/anomalies';
import type {SummaryFilters} from '@/lib/ai/summarySchema';
import {InsightsPanel} from './InsightsPanel';
import { Wallet, Receipt, TrendingUp, TrendingDown, Percent, AlertTriangle, Search, X, Upload, SlidersHorizontal } from 'lucide-react';
import { burnSeries, dashboardModel, groupings, readDashboardFilters, updateDashboardQuery, type DashboardFilters } from '@/lib/costs/dashboard';
import type { CostTableRow } from '@/lib/costs/types';
import type { MutationResult } from '@/app/(app)/projects/actions';
import { formatMoney, formatPercent } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KpiCard } from './KpiCard';
import { CostTable } from './CostTable';
import { EmptyState } from './EmptyState';
import { DashboardSkeleton } from './DashboardSkeleton';
import { EstimatedVsActualBar } from './charts/EstimatedVsActualBar';
import { VariancePctBar } from './charts/VariancePctBar';
import { BurnUpLine } from './charts/BurnUpLine';
import { CostShareDonut } from './charts/CostShareDonut';
const groupLabels = {group:'Group',category:'Category',source:'Source',month:'Month'};
const signed = (value:number, text:string) => value>0?'+'+text:text;
const tone = (value:number|null) => value===null||value===0?'neutral':value>0?'over':'under';
export function ProjectDashboard({ projectId, rows, currency, saveAction, deleteAction, insights }: { insights?:React.ReactNode; projectId:string; rows:CostTableRow[]; currency:string; saveAction:(id:string|null,input:unknown)=>Promise<MutationResult>; deleteAction:(id:string)=>Promise<MutationResult> }) {
  const query=useSearchParams();
  const [view,setView]=useState<'dashboard'|'insights'>('dashboard');
  const [highlight,setHighlight]=useState<{id:string;version:number}|null>(null);
  const [ready,setReady]=useState(false);
  useEffect(()=>setReady(true),[]);
  const {filters,invalid}=useMemo(()=>readDashboardFilters(new URLSearchParams(query.toString())),[query]);
  const model=useMemo(()=>dashboardModel(rows,currency,filters),[rows,currency,filters]);
  const flags=useMemo(()=>anomalies(model.monetaryRows),[model.monetaryRows]);
  const insightFilters:SummaryFilters={...(filters.source?{source:filters.source}:{}),...(filters.category?{category:filters.category}:{}),...(filters.group?{group:filters.group}:{}),...(filters.from?{from:filters.from}:{}),...(filters.to?{to:filters.to}:{}),...(filters.q?{q:filters.q}:{})};
  const sources=useMemo(()=>{
    const values=new Map<string,string>();for(const row of rows)values.set(row.sourceId??'manual',row.sourceName??(row.sourceId===null?'Manual':row.type));return [...values].sort((a,b)=>a[1].localeCompare(b[1],'en'));
  },[rows]);
  const categories=useMemo(()=>[...new Set(rows.map(row=>row.category).filter((value):value is string=>Boolean(value)))].sort(),[rows]);
  const groups=useMemo(()=>[...new Set(rows.map(row=>row.group).filter((value):value is string=>Boolean(value)))].sort(),[rows]);
  const labels=useMemo(()=>new Map(sources),[sources]);
  function label(key:string) {
    if(filters.by==='source')return labels.get(key)??key;
    if(filters.by==='month' && /^\d{4}-\d{2}$/.test(key))return new Intl.DateTimeFormat('en-US',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${key}-01T00:00:00Z`));
    return key;
  }
  const data=model.summaries.map(group=>({...group,label:label(group.key)}));
  const lines=burnSeries(model.monetaryRows,filters.by,label);
  const active=Boolean(filters.source||filters.category||filters.group||filters.from||filters.to||filters.q);
  function update(changes:Partial<Record<keyof DashboardFilters,string|undefined>>,replace=false) {
    const next=updateDashboardQuery(new URLSearchParams(window.location.search),changes);
    const url=`${window.location.pathname}${next.size?'?'+next.toString():''}`;
    // Next.js supports native history updates: URL-only filters do not refetch unchanged project data.
    if(replace)window.history.replaceState(null,'',url);else window.history.pushState(null,'',url);
  }
  function selectKey(key:string) {update({focus:key});document.getElementById('cost-table')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
  function clear() {update({source:undefined,category:undefined,group:undefined,from:undefined,to:undefined,q:undefined,focus:undefined});}
  function selectFilter(kind:'category'|'group',options:string[]) {
    const value=filters[kind];const all=kind==='category'?'All categories':'All groups';
    return <div className="space-y-2"><Label htmlFor={`dashboard-${kind}`}>{groupLabels[kind]}</Label><Select value={value?JSON.stringify(value):'__all'} onValueChange={selected=>update({[kind]:selected==='__all'?undefined:JSON.parse(selected),focus:undefined})}><SelectTrigger id={`dashboard-${kind}`} aria-label={`Filter by ${kind}`} className="w-full"><SelectValue placeholder={all}/></SelectTrigger><SelectContent><SelectItem value="__all">{all}</SelectItem>{value&&!options.includes(value)&&<SelectItem value={JSON.stringify(value)}>{value} (unavailable)</SelectItem>}{options.map(option=><SelectItem key={option} value={JSON.stringify(option)}>{option}</SelectItem>)}</SelectContent></Select></div>;
  }
  if(!ready)return <DashboardSkeleton/>;
  return <div className="min-w-0 space-y-6">
    <section aria-label="Dashboard filters" className="space-y-5 rounded-2xl border bg-card p-4 shadow-sm sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-medium"><SlidersHorizontal className="size-4 text-primary"/>Your project at a glance</div>{active&&<Button size="sm" variant="ghost" onClick={clear}><X className="size-3.5"/>Clear filters</Button>}</div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><div className="space-y-2"><Label htmlFor="dashboard-search">Search items</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"/><Input id="dashboard-search" aria-label="Search by item" placeholder="Search cost items…" className="pl-9" maxLength={200} value={filters.q??''} onChange={event=>update({q:event.target.value||undefined,focus:undefined},true)}/></div></div>
      <div className="space-y-2"><Label htmlFor="dashboard-source">Source</Label><Select value={filters.source??'__all'} onValueChange={source=>update({source:source==='__all'?undefined:source,focus:undefined})}><SelectTrigger id="dashboard-source" aria-label="Filter by source" className="w-full"><SelectValue placeholder="All sources"/></SelectTrigger><SelectContent><SelectItem value="__all">All sources</SelectItem>{filters.source&&!labels.has(filters.source)&&<SelectItem value={filters.source}>Unavailable source</SelectItem>}{sources.map(([id,name])=><SelectItem value={id} key={id}>{name}</SelectItem>)}</SelectContent></Select></div>{selectFilter('group',groups)}{selectFilter('category',categories)}</div>
      <div className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"><div className="space-y-2"><Label htmlFor="dashboard-from">From date</Label><Input id="dashboard-from" type="date" aria-label="From date" value={filters.from??''} max={filters.to} onChange={event=>update({from:event.target.value||undefined,focus:undefined})}/></div><div className="space-y-2"><Label htmlFor="dashboard-to">To date</Label><Input id="dashboard-to" type="date" aria-label="To date" value={filters.to??''} min={filters.from} onChange={event=>update({to:event.target.value||undefined,focus:undefined})}/></div>
      <div className="space-y-2 sm:col-span-2 xl:col-span-1"><span className="text-sm font-medium">Group by</span><div role="radiogroup" aria-label="Group by" className="flex rounded-xl bg-muted p-1" onKeyDown={event=>{const index=groupings.indexOf(filters.by);const next=event.key==='ArrowRight'?groupings[(index+1)%groupings.length]:event.key==='ArrowLeft'?groupings[(index+groupings.length-1)%groupings.length]:event.key==='Home'?groupings[0]:event.key==='End'?groupings[groupings.length-1]:undefined;if(next){event.preventDefault();update({by:next,focus:undefined});event.currentTarget.querySelector<HTMLButtonElement>(`[data-group="${next}"]`)?.focus();}}}>{groupings.map(by=><button key={by} data-group={by} role="radio" aria-checked={filters.by===by} tabIndex={filters.by===by?0:-1} onClick={()=>update({by,focus:undefined})} className={`flex-1 rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:px-3 ${filters.by===by?'bg-background text-foreground shadow-sm':'text-muted-foreground hover:text-foreground'}`}>{groupLabels[by]}</button>)}</div></div></div>
      <p className="text-xs text-muted-foreground">Filters apply to totals, charts and cost items. This URL keeps your view when you share it.</p>
      {invalid.length>0&&<p role="alert" className="text-sm text-warn">Some URL filters were invalid and have been ignored: {invalid.join(', ')}.</p>}
    </section>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5 [&>section:last-child]:col-span-2 xl:[&>section:last-child]:col-span-1">
      <KpiCard title="Total estimated" value={formatMoney(model.totals.estimated,currency)} caption="The plan for this view" icon={Wallet}/>
      <KpiCard title="Total actual" value={formatMoney(model.totals.actual,currency)} caption={`${model.totals.itemCount} ${model.totals.itemCount===1?"item":"items"} in ${currency}`} icon={Receipt}/>
      <KpiCard title="Variance" value={signed(model.totals.variance,formatMoney(model.totals.variance,currency))} tone={tone(model.totals.variance)} caption={model.totals.variance>0?'Above estimate':model.totals.variance<0?'Below estimate':'Estimated and actual match'} icon={model.totals.variance>0?TrendingUp:TrendingDown}/>
      <KpiCard title="% Variance" value={model.totals.variancePct===null?'n/a':signed(model.totals.variancePct,formatPercent(model.totals.variancePct/100))} tone={tone(model.totals.variancePct)} caption="Difference relative to the estimate" icon={Percent}/>
      <KpiCard title="Items over budget" value={`${model.totals.overCount} of ${model.totals.itemCount}`} caption="More than 5% above estimate" icon={AlertTriangle} tone={model.totals.overCount?'over':'neutral'}/>
    </div>
    {(model.otherCurrencyCount>0||model.totals.missingCount>0)&&<div role="note" className="space-y-1 rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm text-muted-foreground">{model.otherCurrencyCount>0&&<p>{model.otherCurrencyCount} {model.otherCurrencyCount===1?"item in other currencies stays":"items in other currencies stay"} in the table. Totals and charts use {currency} only.</p>}{model.totals.missingCount>0&&<p>{model.totals.missingCount} {model.totals.missingCount===1?"item has":"items have"} a missing estimate or actual amount. Totals use the known amounts.</p>}</div>}
    <div role="tablist" aria-label="Dashboard views" className="flex rounded-xl bg-muted p-1 xl:hidden"><button type="button" role="tab" aria-selected={view==='dashboard'} aria-controls="dashboard-view" id="dashboard-tab" className={`flex-1 rounded-lg px-4 py-2 text-sm ${view==='dashboard'?'bg-background shadow-sm':''}`} onClick={()=>setView('dashboard')}>Dashboard</button><button type="button" role="tab" aria-selected={view==='insights'} aria-controls="insights-view" id="insights-tab" className={`flex-1 rounded-lg px-4 py-2 text-sm ${view==='insights'?'bg-background shadow-sm':''}`} onClick={()=>setView('insights')}>AI insights</button></div>
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]"><div id="dashboard-view" className={`min-w-0 space-y-6 ${view==='dashboard'?'':'hidden xl:block'}`}>
    {rows.length===0?<EmptyState title="Your cost story starts here" description="Import your first file or add a cost item below to bring this dashboard to life." action={<Button asChild><Link href={`/projects/${projectId}/import`}><Upload/>Import cost data</Link></Button>}/>:model.rows.length===0?<EmptyState title="No costs match these filters" description="Try a different source, category or date range to see your project again." action={<Button variant="outline" onClick={clear}>Reset dashboard filters</Button>}/>:<div className="grid min-w-0 items-start gap-6 lg:grid-cols-2"><EstimatedVsActualBar data={data} currency={currency} dimension={groupLabels[filters.by].toLowerCase()} onSelect={selectKey}/><VariancePctBar data={data} currency={currency} dimension={groupLabels[filters.by].toLowerCase()} onSelect={selectKey}/><BurnUpLine series={lines} currency={currency} dimension={groupLabels[filters.by].toLowerCase()}/><CostShareDonut data={data} currency={currency} totalActual={model.shareTotal} dimension={groupLabels[filters.by].toLowerCase()} onSelect={selectKey}/></div>}
    <div id="cost-table" className="min-w-0 scroll-mt-6 space-y-4">{filters.focus&&<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-accent/40 p-4 text-sm"><p>Table focus: <strong>{label(filters.focus)}</strong><span className="ml-2 text-muted-foreground">Charts and KPIs keep the full filtered view.</span></p><Button size="sm" variant="outline" onClick={()=>update({focus:undefined})}>Clear chart focus</Button></div>}<CostTable anomalies={flags} focusedRowId={highlight?.id} focusToken={highlight?.version} anomaliesOnly={filters.anomalies==='1'} onAnomaliesOnlyChange={value=>update({anomalies:value?'1':undefined})} key={query.toString()} rows={model.tableRows} currency={currency} saveAction={saveAction} deleteAction={deleteAction} hideFilters emptyFiltered={rows.length>0&&model.tableRows.length===0}/></div>
    </div><aside id="insights-view" aria-label="Project insights" className={`min-w-0 space-y-6 ${view==='insights'?'':'hidden xl:block'}`}>{insights??<InsightsPanel key={JSON.stringify(insightFilters)} projectId={projectId} rows={model.monetaryRows} allRows={rows} flags={flags} filters={insightFilters} onSelect={id=>{setHighlight(previous=>({id,version:(previous?.version??0)+1}));setView('dashboard');update({focus:undefined,anomalies:undefined});}}/>}</aside></div>
  </div>;
}
