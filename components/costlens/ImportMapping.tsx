'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { aiMappingSchema, mappingSample, mappingFieldConfidence, needsAiMapping, type AiMapping } from '@/lib/ai/schemas';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { z } from 'zod';
import { applyMapping, fields, importRowSchema, mappingSchema, parseAmount, parseDate, suggestMapping, validateCandidates, type Candidate, type ColumnMapping, type CostField } from '@/lib/import/mapping';
import type { ParseResponse } from '@/lib/import/schema';
import type { CostTableRow } from '@/lib/costs/types';
import { currencies } from '@/lib/projects/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SourceComparison } from './SourceComparison';
import { CostTable } from './CostTable';
const savedSettingsSchema = z.object({ templates: z.array(z.object({ name: z.string(), source_type: z.string(), mapping: z.unknown() })), sources: z.array(z.object({ id: z.string().uuid(), name: z.string().nullable(), type: z.string() })) });
const templateSchema = z.object({ columns: z.array(z.string()), mapping: mappingSchema, currency: z.string().regex(/^[A-Z]{3}$/), decimal: z.enum(['auto', 'dot', 'comma']).default('auto') });
const labels: Record<CostField, string> = { item: 'Item', group: 'Group', category: 'Category', estimated: 'Estimated', actual: 'Actual', currency: 'Currency', date: 'Date', notes: 'Notes', sourceRef: 'Source reference', confidence: 'Confidence' };
export function ImportMapping({ projectId, table, defaultCurrency, step, onStep, onBack }: { projectId: string; table: ParseResponse; defaultCurrency: string; step: number; onStep: (step: number) => void; onBack: () => void }) {
  const suggestions = useMemo(() => suggestMapping(table.columns), [table.columns]);
  const [mapping, setMapping] = useState<ColumnMapping>(suggestions.mapping);
  const [ai, setAi] = useState<AiMapping>({});
  const [aiPending, setAiPending] = useState(false);
  const [confirmed, setConfirmed] = useState<Set<CostField>>(new Set());
  const effectiveConfidence = Object.fromEntries(fields.map(field => [field, mappingFieldConfidence(field, mapping, suggestions, ai, confirmed)]));
  const needsAi = needsAiMapping(mapping, effectiveConfidence);
  const [currency, setCurrency] = useState(defaultCurrency);
  const [decimal, setDecimal] = useState<'auto' | 'dot' | 'comma'>('auto');
  const [template, setTemplate] = useState(''); const [saveTemplate, setSaveTemplate] = useState(false);
  const [templateNotice, setTemplateNotice] = useState(''); const [settingsLoading, setSettingsLoading] = useState(true);
  const [sources, setSources] = useState<z.infer<typeof savedSettingsSchema>['sources']>([]);
  const [sourceId, setSourceId] = useState(table.sourceId ?? 'new');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [playRequest,setPlayRequest]=useState(0);
  const [selectedRowId,setSelectedRowId]=useState('0');
  const [fixes, setFixes] = useState<Record<string, string>>({});
  const [skipBad, setSkipBad] = useState(false); const [pending, setPending] = useState(false); const [error, setError] = useState(''); const [savedCount, setSavedCount] = useState(0);
  const validation = useMemo(() => validateCandidates(candidates), [candidates]);
  const badRows = new Set(validation.errors.map(error => error.row));
  const cellErrors: Record<string, Partial<Record<CostField, string>>> = {};
  for (const issue of validation.errors) (cellErrors[String(issue.row)] ??= {})[issue.field] = issue.message;
  const previewRows: CostTableRow[] = candidates.map((row, index) => ({ ...row, estimated: importRowSchema.shape.estimated.safeParse(row.estimated).success ? row.estimated : null, actual: importRowSchema.shape.actual.safeParse(row.actual).success ? row.actual : null, currency: typeof row.currency === 'string' && /^[A-Z]{3}$/.test(row.currency) ? row.currency : currency, id: String(index), sourceId: null, sourceName: table.meta.fileName, type: table.meta.sourceType }) as CostTableRow);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/import/templates`);
        if (!response.ok) throw new Error();
        const data = savedSettingsSchema.parse(await response.json());
        if (!active) return;
        const matchingSources = data.sources.filter(source => source.type === table.meta.sourceType);
        setSources(matchingSources);
        if (!table.sourceId) setSourceId(matchingSources.find(source => source.name === table.meta.fileName)?.id ?? 'new');
        const found = data.templates.find(entry => {
          const result = templateSchema.safeParse(entry.mapping);
          return entry.source_type === table.meta.sourceType && result.success && JSON.stringify([...result.data.columns].sort()) === JSON.stringify([...table.columns].sort());
        });
        if (found) {
          const settings = templateSchema.parse(found.mapping);
          if (Object.values(settings.mapping).every(column => table.columns.includes(column))) { setMapping(settings.mapping); setConfirmed(new Set(Object.keys(settings.mapping) as CostField[])); setCurrency(settings.currency); setDecimal(settings.decimal); setTemplateNotice(`Applied saved template: ${found.name}`); }
        }
      } catch { if (active) setTemplateNotice('Saved templates are unavailable. You can map columns manually.'); }
      finally { if (active) setSettingsLoading(false); }
    })();
    return () => { active = false; };
  }, [projectId, table]);
  async function askAi() {
    setAiPending(true); setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/import/suggest-mapping`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mappingSample(table.columns, table.rows)) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'AI could not suggest a mapping. Map the columns manually or try again.');
      const suggestions = aiMappingSchema.parse(result.data);
      if (Object.values(suggestions).some(value => value && !table.columns.includes(value.column))) throw new Error('AI suggested an unavailable column. Please map manually.');
      const next = { ...mapping }; const accepted: AiMapping = {};
      for (const field of fields) {
        const value = suggestions[field];
        if (!value || confirmed.has(field) || effectiveConfidence[field] >= 0.6) continue;
        const previous = fields.find(key => next[key] === value.column);
        if (previous && previous !== field && (confirmed.has(previous) || effectiveConfidence[previous] >= 0.6)) continue;
        if (previous) delete next[previous];
        next[field] = value.column; accepted[field] = value;
      }
      setMapping(next); setAi(current => ({ ...current, ...accepted }));
      toast.success('AI suggestions added. Review the fields before continuing.');
    } catch (cause) { const message = cause instanceof z.ZodError ? 'AI returned an invalid mapping. Please map columns manually.' : cause instanceof Error ? cause.message : 'AI mapping is unavailable. Please map columns manually.'; setError(message); toast.error(message); }
    finally { setAiPending(false); }
  }
  function preview() {
    setError(''); setFixes({}); setSkipBad(false);
    try { setCandidates(applyMapping(table, mapping, { currency, decimal }).candidates); onStep(2); } catch { setError('Check your column mapping and try again.'); }
  }
  function applyFixes() {
    const next = candidates.map((row, index) => {
      const updated = { ...row };
      for (const field of fields) {
        const value = fixes[`${index}:${field}`]; if (value === undefined) continue;
        updated[field] = field === 'estimated' || field === 'actual' ? parseAmount(value, decimal) : field === 'confidence' ? value === '' ? null : Number(value) : field === 'date' ? parseDate(value) : field === 'currency' ? value.toUpperCase() : field === 'item' ? value.trim() : value.trim() || null;
      }
      return updated;
    });
    setCandidates(next); setFixes({});
  }
  async function commit() {
    if (Object.keys(fixes).length) { setError('Apply your fixes before saving.'); return; }
    if (badRows.size && !skipBad) { setError('Fix the highlighted values or select Skip bad rows.'); return; }
    if (!validation.rows.length) { setError('At least one valid row is needed.'); return; }
    setPending(true); setError('');
    try {
      const response = await fetch(`/api/projects/${projectId}/import/commit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(table.meta.fileHash?{fileHash:table.meta.fileHash}:{}), ...(table.meta.mediaJobId?{mediaJobId:table.meta.mediaJobId}:{}), source: { ...(sourceId !== 'new' ? { id: sourceId } : {}), type: table.meta.sourceType, name: table.meta.fileName }, columns: table.columns, mapping, currency, decimal, mode, rows: validation.rows, ...(saveTemplate ? { templateName: template } : {}) }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error ?? 'The import could not be saved.'); return; }
      setSavedCount(result.count); if(result.cleanupPending)toast.warning('Costs saved. Private recording cleanup will retry automatically.');onStep(3); toast.success(`${result.count} cost rows imported`);
    } catch { setError('We could not confirm the save. Check the dashboard before retrying to avoid duplicate rows.'); }
    finally { setPending(false); }
  }
  return <section className="min-w-0 space-y-6" aria-label="Import mapping and preview">
    {step === 1 && <div className="space-y-6 rounded-2xl border bg-card p-4 sm:p-6"><div><h2 className="text-xl font-semibold">Map your cost columns</h2><p className="mt-2 text-sm text-muted-foreground">Choose a CostLens field for each source column. Item is required; other columns can be ignored.</p></div>
      {templateNotice && <p role="status" className="rounded-xl bg-muted p-3 text-sm">{templateNotice}</p>}
      {settingsLoading && <p role="status">Loading saved mappings…</p>}
      {needsAi && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"><Button variant="outline" disabled={settingsLoading || aiPending} onClick={askAi}><Sparkles className="size-4" aria-hidden="true"/>{aiPending ? 'Asking AI…' : 'Ask AI to map columns'}</Button><p className="text-sm text-muted-foreground">Gemini receives the headers and up to five sample rows, with your privacy masking setting applied. Review every suggestion.</p></div>}
      <div className="grid grid-cols-2 gap-4 text-sm font-semibold"><span>Your column</span><span>CostLens field</span></div>
      {table.columns.map(column => { const field = fields.find(field => mapping[field] === column); const aiValue = field && !confirmed.has(field) && ai[field]?.column === column ? ai[field] : undefined; const auto = field && !confirmed.has(field) && suggestions.mapping[field] === column; const sample = table.rows.find(row => row[column] != null)?.[column]; return <div key={column} className="grid grid-cols-2 items-start gap-4 rounded-xl border p-3 sm:p-4"><div className="min-w-0"><p className="break-words font-medium">{column}</p><p className="mt-1 truncate text-xs text-muted-foreground" title={String(sample ?? '')}>{String(sample ?? 'No sample value').slice(0, 200)}</p>{aiValue ? <Tooltip><TooltipTrigger asChild><button type="button" className="mt-2 rounded-md focus-visible:outline-2 focus-visible:outline-ring" aria-label={`AI reason for ${column}`}><Badge variant="secondary"><Sparkles className="mr-1 size-3" aria-hidden="true"/>AI · {Math.round(aiValue.confidence * 100)}%</Badge></button></TooltipTrigger><TooltipContent className="max-w-72">{aiValue.reason}</TooltipContent></Tooltip> : <Badge variant={auto ? 'secondary' : 'outline'} className="mt-2">{auto ? 'auto-matched' : field ? 'confirmed' : 'needs you'}</Badge>}</div><Select value={field ?? '__skip'} disabled={settingsLoading || aiPending} onValueChange={value => { const next = { ...mapping }; for (const key of fields) if (next[key] === column) delete next[key]; if (value !== '__skip') next[value as CostField] = column; setMapping(next); setConfirmed(current => new Set([...current, ...(field ? [field] : []), ...(value !== '__skip' ? [value as CostField] : [])])); }}><SelectTrigger aria-label={`Map ${column}`} className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="__skip">Ignore column</SelectItem>{fields.map(field => <SelectItem key={field} value={field}>{labels[field]}</SelectItem>)}</SelectContent></Select></div>; })}
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="mapping-currency">Default currency</Label><select id="mapping-currency" className="h-10 w-full rounded-md border bg-background px-3" value={currency} disabled={settingsLoading || aiPending} onChange={event => setCurrency(event.target.value)}>{[...new Set([...currencies, defaultCurrency, currency])].map(code => <option key={code}>{code}</option>)}</select></div><div className="space-y-2"><Label htmlFor="mapping-decimal">Number format</Label><select id="mapping-decimal" className="h-10 w-full rounded-md border bg-background px-3" value={decimal} disabled={settingsLoading || aiPending} onChange={event => setDecimal(event.target.value as typeof decimal)}><option value="auto">Auto-detect separators</option><option value="dot">Decimal point: 1,234.50</option><option value="comma">Decimal comma: 1.234,50</option></select></div></div>
      <p className="text-xs text-muted-foreground">A single separator followed by three digits is treated as thousands in auto mode. Choose a number format when your data is ambiguous. Excel serial dates and day/month/year dates are supported.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveTemplate} onChange={event => setSaveTemplate(event.target.checked)}/>Save as template</label>{saveTemplate && <div className="space-y-2"><Label htmlFor="template-name">Template name</Label><Input id="template-name" maxLength={120} value={template} onChange={event => setTemplate(event.target.value)} placeholder="My cost spreadsheet"/></div>}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={aiPending} onClick={onBack}>Back to source</Button><Button disabled={settingsLoading || aiPending || !mapping.item || (saveTemplate && !template.trim())} onClick={preview}>Preview rows</Button></div></div>}
    {step === 2 && <><div className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6"><h2 className="text-xl font-semibold">Review your import</h2><p role="status" className="font-medium">{validation.rows.length.toLocaleString()} rows ready, {badRows.size.toLocaleString()} with problems</p><p className="text-sm text-muted-foreground">Only confirmed rows are saved. Negative amounts are supported for refunds and credits. Formula-like text is escaped when saved.</p>
      {badRows.size > 0 && <><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={skipBad} disabled={pending} onChange={event => setSkipBad(event.target.checked)}/>Skip bad rows</label><details className="rounded-xl border border-over/50 p-3" open><summary className="cursor-pointer font-medium">Fix highlighted values ({validation.errors.length})</summary><div className="max-h-96 space-y-3 overflow-auto py-3">{validation.errors.map(issue => { const key = `${issue.row}:${issue.field}`; return <div key={key} className="space-y-1"><Label htmlFor={`fix-${key}`}>Row {issue.row + 1} · {labels[issue.field]}</Label><Input id={`fix-${key}`} aria-invalid className="border-over" disabled={pending} value={fixes[key] ?? (Number.isNaN(candidates[issue.row][issue.field]) ? '' : String(candidates[issue.row][issue.field] ?? ''))} onChange={event => setFixes({ ...fixes, [key]: event.target.value })}/><p className="text-xs text-over">{issue.message}</p></div>; })}</div><Button variant="outline" disabled={pending || !Object.keys(fixes).length} onClick={applyFixes}>Apply fixes</Button></details></>}
      <div className="space-y-2"><Label htmlFor="import-source">Save into source</Label><select id="import-source" className="h-10 w-full min-w-0 rounded-md border bg-background px-3" value={sourceId} disabled={pending || Boolean(table.meta.mediaJobId)} onChange={event => { setSourceId(event.target.value); setMode('append'); }}><option value="new">New source — {table.meta.fileName}</option>{sources.map(source => <option value={source.id} key={source.id}>{source.name ?? source.type}</option>)}</select></div>
      <fieldset disabled={pending} className="flex flex-wrap gap-4"><legend className="mb-2 text-sm font-medium">Import mode</legend><label className="flex items-center gap-2 text-sm"><input type="radio" name="import-mode" checked={mode === 'append'} onChange={() => setMode('append')}/>Append</label><label className="flex items-center gap-2 text-sm"><input type="radio" name="import-mode" checked={mode === 'replace'} disabled={sourceId === 'new' || Boolean(table.meta.mediaJobId)} onChange={() => setMode('replace')}/>Replace existing rows from this source</label></fieldset>{mode === 'replace' && <p className="text-sm text-over">Only rows belonging to the selected source will be replaced. Manual entries and other sources stay in the project.</p>}
      <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={pending} onClick={() => onStep(1)}>Back to mapping</Button><Button disabled={pending || !validation.rows.length || (badRows.size > 0 && !skipBad) || Object.keys(fixes).length > 0} onClick={commit}>{pending ? 'Saving import…' : `Save ${validation.rows.length} rows`}</Button></div></div>
      <div className={table.meta.ai?"grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]":""}><CostTable rows={previewRows} onPlayRow={table.meta.mediaJobId?row=>{setSelectedRowId(row.id);setPlayRequest(n=>n+1);}:undefined} onSelectRow={table.meta.ai?row=>setSelectedRowId(row.id):undefined} selectedRowId={selectedRowId} currency={currency} previewErrors={cellErrors} renderInvalid={(id, field) => { const key = `${id}:${field}`; return <div className="min-w-40 space-y-1"><Input aria-label={`Fix row ${Number(id) + 1} ${labels[field]}`} aria-invalid disabled={pending} value={fixes[key] ?? (Number.isNaN(candidates[Number(id)][field]) ? '' : String(candidates[Number(id)][field] ?? ''))} onChange={event => setFixes({ ...fixes, [key]: event.target.value })}/><p className="text-xs text-over">{cellErrors[id]?.[field]}</p></div>; }}/>{table.meta.ai&&<SourceComparison playRequest={playRequest} refreshUrl={table.meta.mediaJobId?`/api/projects/${projectId}/media/jobs/${table.meta.mediaJobId}`:undefined} rows={previewRows} onSelect={setSelectedRowId} playbackUrl={table.meta.playbackUrl} mediaType={table.meta.mediaType} row={previewRows.find(row=>row.id===selectedRowId)} previews={table.meta.previews??[]}/>}</div></>}
    {step === 3 && <div className="space-y-4 rounded-2xl border bg-card p-6"><h2 className="text-2xl font-semibold">Import complete</h2><p role="status">{savedCount.toLocaleString()} cost rows saved to your project.</p><Button asChild><Link href={`/projects/${projectId}`}>Go to dashboard</Link></Button></div>}
    {error && <p role="alert" className="rounded-xl border border-over/40 p-4 text-sm text-over">{error}</p>}
  </section>;
}
