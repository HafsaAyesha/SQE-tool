'use client';
import { useEffect, useRef, useState } from 'react';
import { UploadCloud, File, FileText, Image as ImageIcon, Presentation, Mail, FileSpreadsheet, FileCode, Braces, ListTree, LoaderCircle, ClipboardPaste, Link2, ArrowRight, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import type { AdapterDescriptor } from '@/lib/import/adapters/types';
import { extractionEstimateSchema, parseResponseSchema, type ParseResponse, type ParseOptions, type RawTable } from '@/lib/import/schema';
import { MAX_DOCUMENT_BYTES } from '@/lib/import/limits';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from '@/components/ui/table';
import type { OnlineInput } from '@/lib/import/onlineSchema';
import { OnlineSourceForm } from './OnlineSourceForm';
import { ImportMapping } from './ImportMapping';
import { MediaUpload } from './MediaUpload';
import { MEDIA_EXTENSIONS } from '@/shared/media';
import { ExtractionEstimate } from './ExtractionEstimate';
import type { z } from 'zod';
import { Stepper } from './Stepper';
class ClientImportError extends Error {}
const icons = { FileText, Image:ImageIcon, Presentation, Mail, FileSpreadsheet, FileCode, Braces, ListTree, ClipboardPaste };
export type ImportDraft = { file: File | null; online?: OnlineInput; adapterId?: string; options: ParseOptions; table: RawTable; totalCount: number };
export function ImportWizard({ projectId, adapters, onContinue, canSaveSources = false, currency = 'USD' }: { currency?: string; projectId: string; adapters: AdapterDescriptor[]; canSaveSources?: boolean; onContinue?: (draft: ImportDraft) => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const inputRef = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [online, setOnline] = useState<OnlineInput | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [mediaFile,setMediaFile]=useState<File|null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [adapterId, setAdapterId] = useState<string>();
  const [options, setOptions] = useState<ParseOptions>({});
  const [table, setTable] = useState<ParseResponse | null>(null);
  const [paste, setPaste] = useState('');
  const [pending, setPending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [estimate,setEstimate]=useState<z.infer<typeof extractionEstimateSchema>|null>(null);
  const [error, setError] = useState('');
  const fileAdapters = adapters.filter(adapter => adapter.kind !== 'online' && adapter.id !== 'paste');
  const accepts = [...new Set(fileAdapters.flatMap(adapter => adapter.accepts.extensions))].join(',');
  async function parseFile(selected: File, settings: ParseOptions = {}, explicitAdapter?: string, extractAi=false) {
    controller.current?.abort();
    if(MEDIA_EXTENSIONS.includes(selected.name.toLowerCase().split('.').pop() as typeof MEDIA_EXTENSIONS[number])){setMediaFile(selected);setTable(null);setEstimate(null);setFile(null);setCurrentStep(0);setError('');return;}
    setMediaFile(null);
    if (selected.size > MAX_DOCUMENT_BYTES) { setTable(null); setError('Documents must be 10 MB or smaller.'); toast.error('Documents must be 10 MB or smaller.'); return; }
    const abort = new AbortController(); controller.current = abort;
    setOnline(null); setCurrentStep(0); setFile(selected); setOptions(settings); setAdapterId(explicitAdapter); setTable(null); setError(''); setPending(true);if(!extractAi)setEstimate(null);
    const body = new FormData(); body.set('file', selected);
    if (settings.sheet !== undefined) body.set('sheet', settings.sheet);
    if (settings.jsonPath !== undefined) body.set('jsonPath', settings.jsonPath);
    if (explicitAdapter) body.set('adapterId', explicitAdapter);
    if(extractAi){body.set('extractAi','true');body.set('confirmAi',String(settings.confirmAi===true));}
    try {
      const response = await fetch(`/api/projects/${projectId}/import/parse`, { method: 'POST', body, signal: abort.signal });
      const data: unknown = await response.json();
      if (!response.ok) {
        const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : 'We could not read this file. Please try again.';
        throw new ClientImportError(message);
      }
      if(response.status===202){const plan=extractionEstimateSchema.parse((data as {estimate:unknown}).estimate);if(!abort.signal.aborted)setEstimate(plan);return;}
      const result = parseResponseSchema.safeParse(data);
      if (!result.success) throw new ClientImportError('The import response could not be read. Please try again.');
      if (abort.signal.aborted) return;
      setEstimate(null);setTable(result.data); toast.success(`${result.data.totalCount.toLocaleString()} rows ready for review`);
    } catch (cause) {
      if (abort.signal.aborted) return;
      const message = cause instanceof ClientImportError ? cause.message : 'We could not reach the import service. Please try again.';
      setError(message); toast.error(message);
    } finally { if (controller.current === abort) setPending(false); }
  }
  async function reselectOnline(settings: Partial<OnlineInput>) {
    if (!online) return;
    const input = { ...online, ...settings, ...(table?.sourceId ? { sourceId: table.sourceId } : {}) };
    setPending(true); setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/import/fetch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
      const data: unknown = await response.json();
      if (!response.ok) { const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : 'We could not select this table.'; throw new ClientImportError(message); }
      const result = parseResponseSchema.safeParse(data);
      if (!result.success) throw new ClientImportError('The source response could not be read.');
      setTable(result.data); setOnline(input);
    } catch (cause) { const message = cause instanceof ClientImportError ? cause.message : 'We could not reach the import service.'; setError(message); toast.error(message); }
    finally { setPending(false); }
  }
  async function continueToMapping() {
    if (!table) return;
    setPending(true); setError('');
    try {
      let full = table;
      if (table.totalCount > table.rows.length) {
        let response: Response;
        if (file) {
          const body = new FormData(); body.set('file', file); body.set('full', 'true');
          if (options.sheet !== undefined) body.set('sheet', options.sheet);
          if (options.jsonPath !== undefined) body.set('jsonPath', options.jsonPath);
          if (adapterId) body.set('adapterId', adapterId);
          if(table.meta.ai){body.set('extractAi','true');body.set('confirmAi',String(options.confirmAi===true));}
          response = await fetch(`/api/projects/${projectId}/import/parse`, { method: 'POST', body });
        } else if (online) {
          response = await fetch(`/api/projects/${projectId}/import/fetch?full=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...online, ...(table.sourceId ? { sourceId: table.sourceId } : {}) }) });
        } else throw new ClientImportError('Choose the source again to load every row.');
        const result: unknown = await response.json();
        if (!response.ok) throw new ClientImportError('We could not load every row. Please fetch or choose the source again.');
        full = parseResponseSchema.parse(result);
        if (full.rows.length !== full.totalCount) throw new ClientImportError('The complete source was not returned. Please retry.');
        setTable(full);
      }
      const draft: ImportDraft = { file, ...(online ? { online } : {}), adapterId, options, table: full, totalCount: full.totalCount };
      setCurrentStep(1); onContinue?.(draft);
    } catch (cause) { setError(cause instanceof ClientImportError ? cause.message : 'The complete source could not be loaded.'); }
    finally { setPending(false); }
  }
  function display(value: unknown) { if (value === null || value === undefined) return '—'; const text = typeof value === 'object' ? JSON.stringify(value) : String(value); return text.length > 160 ? `${text.slice(0, 160)}…` : text; }
  if (!ready) return <div role="status" className="rounded-2xl border bg-card p-6 text-muted-foreground">Preparing import tools…</div>;
  return <div className="space-y-6"><Stepper currentStep={currentStep}/>
    <div hidden={currentStep !== 0}><Tabs defaultValue="upload"><TabsList className="mb-4 grid h-auto w-full grid-cols-3 sm:w-fit"><TabsTrigger value="upload" disabled={pending}><UploadCloud className="size-4"/>Upload file</TabsTrigger><TabsTrigger value="paste" disabled={pending}><ClipboardPaste className="size-4"/>Paste data</TabsTrigger><TabsTrigger value="link" disabled={pending}><Link2 className="size-4"/>From a link</TabsTrigger></TabsList>
      <TabsContent value="upload"><input ref={inputRef} type="file" accept={accepts} aria-label="Choose cost data file" className="sr-only" disabled={pending} onChange={event => { const selected = event.target.files?.[0]; if (selected) void parseFile(selected); event.target.value = ''; }}/>
        <div onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (pending) return; if (event.dataTransfer.files.length !== 1) { setError('Drop exactly one file at a time.'); return; } void parseFile(event.dataTransfer.files[0]); }} className={`rounded-2xl border-2 border-dashed bg-card p-6 text-center transition-colors sm:p-12 ${dragging ? 'border-primary bg-accent' : 'border-border'}`}>
          <UploadCloud className="mx-auto mb-5 size-10 text-primary"/><h2 className="text-xl font-semibold">Bring your cost data together</h2><p className="mb-6 mt-2 text-sm text-muted-foreground">Drag and drop a file, or choose one from your device. Documents: up to 10 MB and 5,000 rows. Recordings: up to 500 MB and 30 minutes.</p><Button disabled={pending} onClick={() => inputRef.current?.click()}><UploadCloud/>Choose file</Button><div className="mt-6 flex flex-wrap justify-center gap-3">{fileAdapters.map(adapter => { const Icon = icons[adapter.icon as keyof typeof icons] ?? File; return <span key={adapter.id} className="flex items-center gap-1.5 rounded-lg bg-muted px-2.5 py-1.5 text-xs text-muted-foreground"><Icon className="size-3.5"/>{adapter.label} <span className="sr-only">{adapter.accepts.extensions.join(', ')}</span></span>; })}</div>
        </div>
      </TabsContent>
      <TabsContent value="paste"><div className="space-y-4 rounded-2xl border bg-card p-6"><div><Label htmlFor="paste-data">Tab-separated cost data</Label><p className="mt-2 text-sm text-muted-foreground">Copy cells from a spreadsheet, including the header row.</p></div><textarea id="paste-data" value={paste} onChange={event => setPaste(event.target.value)} rows={8} disabled={pending} className="w-full rounded-xl border bg-background p-3 font-mono text-sm focus-visible:outline-2 focus-visible:outline-ring" placeholder={'Item\tEstimated\tActual\nCloud hosting\t100\t80'}/><Button disabled={pending || !paste.trim()} onClick={() => void parseFile(new globalThis.File([paste], 'pasted-data.txt', { type: 'text/plain' }), {}, 'paste')}><ClipboardPaste/>Read pasted data</Button></div></TabsContent>
      <TabsContent value="link"><OnlineSourceForm projectId={projectId} canSave={canSaveSources} busy={pending} onSourceChange={() => { setTable(null); setCurrentStep(0); }} onPendingChange={busy => { setOnlineBusy(busy); setPending(busy); if (busy) { controller.current?.abort(); setTable(null); setError(''); } }} onFetched={(result, input) => { controller.current?.abort(); setPending(false); setError(''); setFile(null); setEstimate(null);setOptions({}); setOnline(input); setTable(result); setCurrentStep(0); }}/></TabsContent>
    </Tabs></div>
    {currentStep===0&&<MediaUpload projectId={projectId} file={mediaFile} onPendingChange={setPending} onReview={result=>{setTable(result);setFile(null);setCurrentStep(1);}}/>}
    {pending && <div role="status" className="flex items-center gap-3 rounded-xl border bg-card p-4"><LoaderCircle className="size-5 animate-spin text-primary"/>Reading source…{!onlineBusy && !online && file && <Button variant="ghost" className="ml-auto" onClick={() => { controller.current?.abort(); setPending(false); }}>Cancel</Button>}</div>}
    {estimate && currentStep===0 && file && <ExtractionEstimate key={`${file.name}:${file.lastModified}`} estimate={estimate} pending={pending} onConfirm={()=>void parseFile(file,{...options,confirmAi:true},adapterId,true)}/>}
    {error && <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertTriangle className="size-5 shrink-0"/>{error}</div>}
    {table && currentStep > 0 && <ImportMapping projectId={projectId} table={table} defaultCurrency={currency} step={currentStep} onStep={step=>{setCurrentStep(step);if(step===3){setFile(null);setMediaFile(null);setTable(current=>current?{...current,meta:{...current.meta,previews:undefined}}:current);}}} onBack={() => setCurrentStep(0)}/>}
    {table && currentStep === 0 && <section aria-label="Source table preview" className="space-y-5 rounded-2xl border bg-card p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="break-all text-lg font-semibold">{table.meta.fileName}</h2><p className="mt-1 text-sm text-muted-foreground">{table.totalCount.toLocaleString()} {table.totalCount === 1 ? 'row' : 'rows'} found · Showing {table.rows.length.toLocaleString()} {table.rows.length === 1 ? 'row' : 'rows'}</p></div>{currentStep === 0 && <Button disabled={pending} onClick={continueToMapping}>Continue to mapping<ArrowRight/></Button>}</div>
      <div className="flex flex-wrap gap-4">{table.meta.sheets && <div className="w-full space-y-2 sm:w-64"><Label htmlFor="import-sheet">Worksheet</Label><Select value={table.meta.sheet} disabled={pending} onValueChange={sheet => { if (file) void parseFile(file, { ...options, sheet }, adapterId); }}><SelectTrigger id="import-sheet" className="w-full"><SelectValue/></SelectTrigger><SelectContent>{table.meta.sheets.map(sheet => <SelectItem value={sheet} key={sheet}>{sheet}</SelectItem>)}</SelectContent></Select></div>}
        {table.meta.jsonPaths && <div className="w-full space-y-2 sm:w-80"><Label htmlFor="import-path">Data path</Label><Select value={JSON.stringify(online?.jsonPath ?? options.jsonPath ?? table.meta.jsonPaths[0])} disabled={pending} onValueChange={path => { if (online) void reselectOnline({ jsonPath: JSON.parse(path) }); else if (file) void parseFile(file, { ...options, jsonPath: JSON.parse(path) }, adapterId); }}><SelectTrigger id="import-path" className="w-full"><SelectValue/></SelectTrigger><SelectContent>{table.meta.jsonPaths.map(path => <SelectItem value={JSON.stringify(path)} key={path}>{path || '(root array)'}</SelectItem>)}</SelectContent></Select></div>}
        {online && table.meta.tables && <div className="w-full space-y-2 sm:w-80"><Label htmlFor="import-table">Web table</Label><Select value={String(table.meta.tableIndex ?? 0)} disabled={pending} onValueChange={index => void reselectOnline({ tableIndex: Number(index) })}><SelectTrigger id="import-table" className="w-full"><SelectValue/></SelectTrigger><SelectContent>{table.meta.tables.map((name, index) => <SelectItem value={String(index)} key={index}>{name}</SelectItem>)}</SelectContent></Select></div>}</div>
      {table.meta.warnings.length > 0 && <ul className="space-y-2 rounded-xl bg-muted p-4 text-sm text-muted-foreground">{table.meta.warnings.map(warning => <li key={warning} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn"/>{warning}</li>)}</ul>}
      <div className="max-h-96 overflow-auto rounded-xl border"><Table><TableHeader><TableRow>{table.columns.map(column => <TableHead key={column}>{column}</TableHead>)}</TableRow></TableHeader><TableBody>{table.rows.map((row, index) => <TableRow key={index}>{table.columns.map(column => <TableCell key={column} className="max-w-72 truncate">{display(row[column])}</TableCell>)}</TableRow>)}</TableBody></Table></div>
      <p className="text-xs text-muted-foreground">Review the source and selection before mapping columns. {table.sourceId ? 'Source settings are encrypted and saved; no cost items have been created.' : 'No source settings or cost items have been saved.'}</p>
    </section>}
  </div>;
}
