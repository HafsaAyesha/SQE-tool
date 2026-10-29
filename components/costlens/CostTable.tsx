'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Pencil, Trash2, Search, Save, X, ChevronLeft, ChevronRight, LoaderCircle, Play, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { costInputSchema, type CostInput } from '@/lib/costs/schema';
import {anomalyLabels,type Anomaly} from '@/lib/costs/anomalies';
import type { CostField } from '@/lib/import/mapping';
import type { CostTableRow } from '@/lib/costs/types';
import { PAGE_SIZE, selectRows, type SortColumn } from '@/lib/costs/table';
import { rowVariance, rowVariancePct, status, type CostStatus } from '@/lib/costs/calc';
import { formatMoney, formatPercent } from '@/lib/format';
import type { MutationResult } from '@/app/(app)/projects/actions';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

type Props = {
  rows: CostTableRow[];
  currency: string;
  hideFilters?: boolean;
  emptyFiltered?: boolean;
  renderInvalid?: (rowId: string, field: CostField) => React.ReactNode;
  anomalies?: Anomaly[];
  focusedRowId?:string;
  focusToken?:number;
  anomaliesOnly?:boolean;
  onAnomaliesOnlyChange?:(value:boolean)=>void;
  onPlayRow?: (row: CostTableRow) => void;
  onSelectRow?: (row: CostTableRow) => void;
  selectedRowId?: string;
  previewErrors?: Record<string, Partial<Record<CostField, string>>>;
  saveAction?: (rowId: string | null, input: unknown) => Promise<MutationResult>;
  deleteAction?: (rowId: string) => Promise<MutationResult>;
};
type Draft = { item: string; group: string; category: string; estimated: string; actual: string; date: string; notes: string };
const emptyDraft: Draft = { item: '', group: '', category: '', estimated: '', actual: '', date: '', notes: '' };
const columns: { key: SortColumn; label: string; numeric?: boolean }[] = [
  { key: 'item', label: 'Item' }, { key: 'group', label: 'Group' }, { key: 'category', label: 'Category' },
  { key: 'estimated', label: 'Estimated', numeric: true }, { key: 'actual', label: 'Actual', numeric: true },
  { key: 'variance', label: 'Variance', numeric: true }, { key: 'percentVariance', label: '% Variance', numeric: true },
  { key: 'status', label: 'Status' }, { key: 'date', label: 'Date' }, { key: 'source', label: 'Source' },
];
const statusLabels: Record<CostStatus, string> = { under: 'Under budget', on: 'On target', over: 'Over budget', unknown: 'Unknown' };
function VarianceValue({ row, percent = false, invalid = false }: { row: CostTableRow; percent?: boolean; invalid?: boolean }) {
  const value = invalid ? null : percent ? rowVariancePct(row) : rowVariance(row);
  if (value === null) return <span className="text-muted-foreground" title="An estimate and actual cost are required; percentages also require a nonzero estimate.">{percent ? 'n/a' : '—'}</span>;
  const Icon = value > 0 ? ArrowUp : value < 0 ? ArrowDown : null;
  return <span className={`inline-flex items-center justify-end gap-1 tabular-nums ${value > 0 ? 'text-over' : value < 0 ? 'text-under' : 'text-muted-foreground'}`}>{Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0"/>}{value > 0 ? '+' : ''}{percent ? formatPercent(value / 100) : formatMoney(value, row.currency)}</span>;
}
function StatusBadge({ row, invalid }: { row: CostTableRow; invalid: boolean }) {
  const value = invalid ? 'unknown' : status(row);
  return <Badge variant="outline" title="On target means within ±5% of the estimate." className={value === 'over' ? 'border-over/40 text-over' : value === 'under' ? 'border-under/40 text-under' : 'text-muted-foreground'}>{statusLabels[value]}</Badge>;
}
/** With no mutation actions, the same table is a read-only preview/report table. */
export function CostTable({ rows, currency, saveAction, deleteAction, previewErrors = {}, renderInvalid, anomalies:rowAnomalies, focusedRowId, focusToken=0, anomaliesOnly, onAnomaliesOnlyChange, onPlayRow, onSelectRow, selectedRowId, hideFilters = false, emptyFiltered = false }: Props) {
  const router = useRouter();
  const [localAnomaliesOnly,setLocalAnomaliesOnly]=useState(false);
  const onlyAnomalies=anomaliesOnly??localAnomaliesOnly;
  const anomalyMap=useMemo(()=>new Map(rowAnomalies?.map(flag=>[flag.rowId,flag])??[]),[rowAnomalies]);
  const scrolledFocus=useRef('');
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<SortColumn>('item');
  const [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Partial<Record<keyof CostInput, string[]>>>({});
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState<CostTableRow | null>(null);
  const filtered = useMemo(() => selectRows(rows.filter(row=>!onlyAnomalies||anomalyMap.has(row.id)), { search, group, category, sort, direction }), [rows, search, group, category, sort, direction,onlyAnomalies,anomalyMap]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  useEffect(()=>{
    if(!focusedRowId)return;const key=`${focusedRowId}:${focusToken}`;if(scrolledFocus.current===key)return;
    const index=filtered.findIndex(row=>row.id===focusedRowId);if(index<0)return;
    const target=Math.floor(index/PAGE_SIZE)+1;if(target!==currentPage){setPage(target);return;}
    const frame=requestAnimationFrame(()=>{const node=document.getElementById(`cost-row-${focusedRowId}`);if(node){node.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});node.focus({preventScroll:true});scrolledFocus.current=key;}});return()=>cancelAnimationFrame(frame);
  },[focusedRowId,focusToken,filtered,currentPage]);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const groups = [...new Set(rows.map(row => row.group).filter((value): value is string => Boolean(value)))].sort();
  const categories = [...new Set(rows.map(row => row.category).filter((value): value is string => Boolean(value)))].sort();
  const locked = pending || editing !== null;
  function edit(row?: CostTableRow) {
    setEditing({ id: row?.id ?? null }); setErrors({});
    setDraft(row ? { item: row.item, group: row.group ?? '', category: row.category ?? '', estimated: row.estimated?.toString() ?? '', actual: row.actual?.toString() ?? '', date: row.date ?? '', notes: row.notes ?? '' } : { ...emptyDraft });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!saveAction || !editing) return;
    const parsed = costInputSchema.safeParse(draft);
    if (!parsed.success) { setErrors(parsed.error.flatten().fieldErrors); return; }
    setPending(true); setErrors({});
    try {
      const result = await saveAction(editing.id, parsed.data);
      if (result.error) { toast.error(result.error); return; }
      toast.success(editing.id ? 'Cost item updated' : 'Cost item added');
      setEditing(null); router.refresh();
    } catch { toast.error('We could not save this row. Please try again.'); }
    finally { setPending(false); }
  }
  async function remove() {
    if (!deleting || !deleteAction) return;
    setPending(true);
    try {
      const result = await deleteAction(deleting.id);
      if (result.error) { toast.error(result.error); return; }
      toast.success('Cost item deleted'); setDeleting(null); router.refresh();
    } catch { toast.error('We could not delete this row. Please try again.'); }
    finally { setPending(false); }
  }
  function field(name: keyof Draft, label: string, type = 'text', maxLength?: number) {
    const error = errors[name]?.[0];
    return <div className="space-y-1"><Label htmlFor={`row-${name}`} className="sr-only">{label}</Label><Input id={`row-${name}`} name={name} type={type} value={draft[name]} onChange={event => setDraft({ ...draft, [name]: event.target.value })} disabled={pending} maxLength={maxLength} min={type === 'number' ? 0 : undefined} step={type === 'number' ? '.01' : undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `row-${name}-error` : undefined} autoFocus={name === 'item'} className={name === 'item' ? 'min-w-44' : 'min-w-32'}/>{error && <p id={`row-${name}-error`} className="max-w-44 text-xs text-destructive" role="alert">{error}</p>}</div>;
  }
  function editor() {
    return <><TableRow className="bg-accent/30"><TableCell>{field('item', 'Item', 'text', 200)}</TableCell><TableCell>{field('group', 'Group', 'text', 120)}</TableCell><TableCell>{field('category', 'Category', 'text', 80)}</TableCell><TableCell>{field('estimated', 'Estimated', 'number')}</TableCell><TableCell>{field('actual', 'Actual', 'number')}</TableCell><TableCell/><TableCell/><TableCell><Badge variant="outline">Editing</Badge></TableCell><TableCell>{field('date', 'Date', 'date')}</TableCell><TableCell><Badge variant="secondary">{editing?.id ? rows.find(row => row.id === editing.id)?.sourceName ?? rows.find(row => row.id === editing.id)?.type ?? 'Manual' : 'Manual'}</Badge></TableCell><TableCell><div className="flex gap-2"><Button type="submit" size="sm" disabled={pending}>{pending ? <LoaderCircle className="animate-spin"/> : <Save/>}Save row</Button><Button type="button" variant="ghost" size="icon" aria-label="Cancel editing" onClick={() => setEditing(null)} disabled={pending}><X/></Button></div></TableCell></TableRow><TableRow className="bg-accent/30"><TableCell colSpan={columns.length + (saveAction || deleteAction ? 1 : 0)}><div className="max-w-xl space-y-2"><Label htmlFor="row-notes">Notes (optional)</Label>{field('notes', 'Notes')}</div></TableCell></TableRow></>;
  }
  return <section className="min-w-0 space-y-5" aria-label="Cost items">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-lg font-semibold">Cost items</h2><p className="mt-1 text-sm text-muted-foreground">Your plan and actual spend, in one place.</p></div>{saveAction && <Button type="button" onClick={() => edit()} disabled={locked}><Plus/>Add row</Button>}</div>
    {!hideFilters && <div className="flex flex-wrap gap-3"><div className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground"/><Input aria-label="Search by item" placeholder="Search cost items…" className="pl-9" value={search} disabled={locked} onChange={event => { setSearch(event.target.value); setPage(1); }}/></div>
      <Select value={group ? JSON.stringify(group) : '__all'} disabled={locked} onValueChange={value => { setGroup(value === '__all' ? '' : JSON.parse(value)); setPage(1); }}><SelectTrigger aria-label="Filter by group" className="w-full sm:w-44"><SelectValue placeholder="All groups"/></SelectTrigger><SelectContent><SelectItem value="__all">All groups</SelectItem>{groups.map(value => <SelectItem value={JSON.stringify(value)} key={value}>{value}</SelectItem>)}</SelectContent></Select>
      <Select value={category ? JSON.stringify(category) : '__all'} disabled={locked} onValueChange={value => { setCategory(value === '__all' ? '' : JSON.parse(value)); setPage(1); }}><SelectTrigger aria-label="Filter by category" className="w-full sm:w-44"><SelectValue placeholder="All categories"/></SelectTrigger><SelectContent><SelectItem value="__all">All categories</SelectItem>{categories.map(value => <SelectItem value={JSON.stringify(value)} key={value}>{value}</SelectItem>)}</SelectContent></Select>
      {(search || group || category) && <Button type="button" variant="ghost" disabled={locked} onClick={() => { setSearch(''); setGroup(''); setCategory(''); setPage(1); }}>Clear filters</Button>}
    </div>}
    {rowAnomalies&&<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyAnomalies} disabled={locked} onChange={event=>{setPage(1);if(onAnomaliesOnlyChange)onAnomaliesOnlyChange(event.target.checked);else setLocalAnomaliesOnly(event.target.checked);}}/>Anomalies only <span className="text-muted-foreground">({rowAnomalies.length})</span></label>}
    <form onSubmit={save} noValidate className="min-w-0 rounded-2xl border bg-card shadow-sm [&_[data-slot=table-container]]:max-h-[65vh] [&_[data-slot=table-container]]:overflow-auto [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-card [&_td[data-invalid=true]]:outline [&_td[data-invalid=true]]:outline-2 [&_td[data-invalid=true]]:outline-over [&_td[data-invalid=true]]:outline-offset-[-2px]">
      <Table><TableHeader><TableRow>{columns.map(column => <TableHead key={column.key} aria-sort={sort === column.key ? direction === 'asc' ? 'ascending' : 'descending' : 'none'} className={column.numeric ? 'text-right' : ''}><Button type="button" variant="ghost" size="sm" className={`-mx-2 px-2 ${column.numeric ? 'ml-auto' : ''}`} aria-label={`Sort by ${column.label}`} disabled={locked} onClick={() => { setSort(column.key); setDirection(sort === column.key && direction === 'asc' ? 'desc' : 'asc'); setPage(1); }}>{column.label}{sort === column.key ? direction === 'asc' ? <ArrowUp className="size-3"/> : <ArrowDown className="size-3"/> : <ArrowUpDown className="size-3 text-muted-foreground"/>}</Button></TableHead>)}{(saveAction || deleteAction) && <TableHead><span className="sr-only">Actions</span></TableHead>}</TableRow></TableHeader>
        <TableBody>{editing?.id === null && editor()}
          {visible.map(row => editing?.id === row.id ? <Fragment key={row.id}>{editor()}</Fragment> : <TableRow id={`cost-row-${row.id}`} tabIndex={focusedRowId===row.id?-1:undefined} data-highlighted={focusedRowId===row.id} key={row.id} data-selected={selectedRowId===row.id} className={[focusedRowId===row.id?'bg-warn/15 outline-2 outline-warn outline-offset-[-2px]':'',onSelectRow && row.confidence!==null && row.confidence<.7 ? '[&>td]:outline [&>td]:outline-1 [&>td]:outline-warn [&>td]:-outline-offset-1' : ''].join(' ')} title={onSelectRow && row.confidence!==null && row.confidence<.7 ? `Check extracted values · ${row.sourceRef??'source unknown'}` : undefined}><TableCell aria-label={row.item} data-invalid={Boolean(previewErrors[row.id]?.item)} aria-invalid={Boolean(previewErrors[row.id]?.item)} className="max-w-64 whitespace-normal break-words font-medium" title={row.notes ?? undefined}>{anomalyMap.has(row.id)&&<Tooltip><TooltipTrigger asChild><button type="button" className="mr-1 inline-flex rounded p-1 text-warn focus-visible:outline-2 focus-visible:outline-ring" aria-label={`Anomaly in ${row.item}`}><AlertTriangle className="size-4"/></button></TooltipTrigger><TooltipContent className="max-w-80">{anomalyMap.get(row.id)!.rules.map(rule=>anomalyLabels[rule]).join('; ')}</TooltipContent></Tooltip>}{onPlayRow&&<Button type="button" variant="ghost" size="icon" aria-label={`Play recording for ${row.item}`} onClick={()=>onPlayRow(row)}><Play className="size-4"/></Button>}{onSelectRow && row.confidence!==null && <Tooltip><TooltipTrigger asChild><button type="button" onClick={()=>onSelectRow(row)} aria-label={`Compare source for ${row.item}`} className="mr-2 inline-flex items-center gap-1 rounded-md p-1 text-xs focus-visible:outline-2 focus-visible:outline-ring"><span aria-hidden="true" className={`size-2 rounded-full ${row.confidence<.7?'bg-warn':'bg-under'}`}/>{Math.round(row.confidence*100)}%{row.confidence<.7&&' · check'}</button></TooltipTrigger><TooltipContent>Check · {row.sourceRef??'Unknown source'}. Compare against the original.</TooltipContent></Tooltip>}{previewErrors[row.id]?.item && renderInvalid ? renderInvalid(row.id, 'item') : row.item}{previewErrors[row.id] && <Badge variant="outline" className="ml-2 border-over text-over" title={Object.values(previewErrors[row.id]).join("; ")}>{Object.keys(previewErrors[row.id]).length} problems</Badge>}</TableCell><TableCell data-invalid={Boolean(previewErrors[row.id]?.group)} aria-invalid={Boolean(previewErrors[row.id]?.group)} className="max-w-40 whitespace-normal break-words">{previewErrors[row.id]?.group && renderInvalid ? renderInvalid(row.id, 'group') : row.group ?? '—'}</TableCell><TableCell data-invalid={Boolean(previewErrors[row.id]?.category)} aria-invalid={Boolean(previewErrors[row.id]?.category)} className="max-w-40 whitespace-normal break-words">{previewErrors[row.id]?.category && renderInvalid ? renderInvalid(row.id, 'category') : row.category ?? '—'}</TableCell><TableCell data-invalid={Boolean(previewErrors[row.id]?.estimated)} aria-invalid={Boolean(previewErrors[row.id]?.estimated)} className="text-right tabular-nums">{previewErrors[row.id]?.estimated && renderInvalid ? renderInvalid(row.id, 'estimated') : row.estimated === null ? '—' : formatMoney(row.estimated, row.currency || currency)}</TableCell><TableCell data-invalid={Boolean(previewErrors[row.id]?.actual)} aria-invalid={Boolean(previewErrors[row.id]?.actual)} className="text-right tabular-nums">{previewErrors[row.id]?.actual && renderInvalid ? renderInvalid(row.id, 'actual') : row.actual === null ? '—' : formatMoney(row.actual, row.currency || currency)}</TableCell><TableCell className="text-right"><VarianceValue row={row} invalid={Boolean(previewErrors[row.id]?.estimated || previewErrors[row.id]?.actual)}/></TableCell><TableCell className="text-right"><VarianceValue row={row} percent invalid={Boolean(previewErrors[row.id]?.estimated || previewErrors[row.id]?.actual)}/></TableCell><TableCell><StatusBadge row={row} invalid={Boolean(previewErrors[row.id])}/></TableCell><TableCell data-invalid={Boolean(previewErrors[row.id]?.date)} aria-invalid={Boolean(previewErrors[row.id]?.date)}>{previewErrors[row.id]?.date && renderInvalid ? renderInvalid(row.id, 'date') : row.date ?? '—'}</TableCell><TableCell><Badge variant="secondary" title={row.sourceRef ?? undefined}>{row.sourceName ?? (row.type === 'manual' ? 'Manual' : row.type)}</Badge></TableCell>{(saveAction || deleteAction) && <TableCell><div className="flex gap-1">{saveAction && <Button type="button" variant="ghost" size="icon" aria-label={`Edit ${row.item}`} onClick={() => edit(row)} disabled={locked}><Pencil className="size-4"/></Button>}{deleteAction && <Button type="button" variant="ghost" size="icon" aria-label={`Delete ${row.item}`} onClick={() => setDeleting(row)} disabled={locked}><Trash2 className="size-4"/></Button>}</div></TableCell>}</TableRow>)}
          {filtered.length === 0 && !editing && <TableRow><TableCell colSpan={columns.length + (saveAction || deleteAction ? 1 : 0)} className="h-48 text-center"><p className="font-medium">{rows.length === 0 && !emptyFiltered ? 'No cost items yet' : 'No matching cost items'}</p><p className="mt-2 text-sm text-muted-foreground">{rows.length === 0 && !emptyFiltered ? saveAction ? 'Add your first row to start tracking this project.' : 'Cost items will appear here.' : 'Try a different search or clear your filters.'}</p></TableCell></TableRow>}
        </TableBody>
      </Table>
    </form>
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><p role="status">{filtered.length ? `${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, filtered.length)}` : '0'} of {filtered.length} items</p><div className="flex items-center gap-3"><Button type="button" variant="outline" size="icon" aria-label="Previous page" disabled={currentPage <= 1 || locked} onClick={() => setPage(currentPage - 1)}><ChevronLeft/></Button><span>Page {currentPage} of {pages}</span><Button type="button" variant="outline" size="icon" aria-label="Next page" disabled={currentPage >= pages || locked} onClick={() => setPage(currentPage + 1)}><ChevronRight/></Button></div></div>
    <Dialog open={deleting !== null} onOpenChange={open => { if (!open && !pending) setDeleting(null); }}><DialogContent><DialogHeader><DialogTitle>Delete cost item?</DialogTitle><DialogDescription>“{deleting?.item}” will be permanently removed from this project.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={pending} onClick={() => setDeleting(null)}>Cancel</Button><Button variant="destructive" disabled={pending} onClick={remove}>{pending && <LoaderCircle className="animate-spin"/>}Delete row</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
