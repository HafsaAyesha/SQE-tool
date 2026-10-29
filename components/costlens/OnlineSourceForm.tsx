'use client';
import { useState } from 'react';
import { Globe, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { onlineRequestSchema, type OnlineInput } from '@/lib/import/onlineSchema';
import type { z } from 'zod';
import { ExtractionEstimate } from './ExtractionEstimate';
import { extractionEstimateSchema, parseResponseSchema, type ParseResponse } from '@/lib/import/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
export function OnlineSourceForm({ projectId, canSave, busy = false, onFetched, onPendingChange, onSourceChange }: { projectId: string; canSave: boolean; busy?: boolean; onPendingChange?: (pending: boolean) => void; onSourceChange?: () => void; onFetched: (table: ParseResponse, input: OnlineInput) => void }) {
  const [url, setUrl] = useState('');
  const [type, setType] = useState<OnlineInput['type']>('auto');
  const [auth, setAuth] = useState(false);
  const [headerName, setHeaderName] = useState('Authorization');
  const [apiKey, setApiKey] = useState('');
  const [saveSource, setSaveSource] = useState(false);
  const [pending, setPending] = useState(false);
  const blocked = pending || busy;
  const [estimate,setEstimate]=useState<z.infer<typeof extractionEstimateSchema>|null>(null);
  const [error, setError] = useState('');
  async function submit(event?: React.FormEvent,confirmAi=false) {
    event?.preventDefault(); setError('');
    const parsed = onlineRequestSchema.safeParse({ type, url, ...(confirmAi?{confirmAi:true}:{}), ...(auth ? { headerName, apiKey } : {}), saveSource });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setPending(true); onPendingChange?.(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/import/fetch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data) });
      const data: unknown = await response.json();
      if (!response.ok) { const message = typeof data === 'object' && data !== null && 'error' in data && typeof data.error === 'string' ? data.error : 'We could not fetch this source.'; setError(message); toast.error(message); return; }
      if(response.status===202){setEstimate(extractionEstimateSchema.parse((data as {estimate:unknown}).estimate));return;}
      setEstimate(null);
      const table = parseResponseSchema.safeParse(data);
      if (!table.success) { setError('The source response could not be read.'); return; }
      onFetched(table.data, parsed.data); toast.success(`${table.data.totalCount.toLocaleString()} rows ready for review`);
    } catch { setError('We could not reach the import service. Please try again.'); }
    finally { setPending(false); onPendingChange?.(false); }
  }
  return <form onSubmit={event=>void submit(event)} noValidate className="space-y-5 rounded-2xl border bg-card p-6" aria-label="Online source"><div className="grid gap-5 sm:grid-cols-[1fr_15rem]"><div className="space-y-2"><Label htmlFor="source-url">Source URL</Label><Input id="source-url" type="url" value={url} onChange={event => { setEstimate(null);setUrl(event.target.value); onSourceChange?.(); }} placeholder="https://…" maxLength={4096} disabled={blocked}/><p className="text-xs text-muted-foreground">Public Google Sheets, JSON/CSV endpoints and web page tables.</p></div><div className="space-y-2"><Label htmlFor="source-type">Source type</Label><Select value={type} onValueChange={value => { setEstimate(null);setType(value as OnlineInput['type']); onSourceChange?.(); }} disabled={blocked}><SelectTrigger id="source-type" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="auto">Detect automatically</SelectItem><SelectItem value="gsheets">Google Sheets</SelectItem><SelectItem value="url">JSON / CSV / REST API</SelectItem><SelectItem value="html">Web page table</SelectItem></SelectContent></Select></div></div>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auth} onChange={event => { setAuth(event.target.checked); onSourceChange?.(); }} disabled={blocked} className="size-4 accent-primary"/>Use an API key</label>
    {auth && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="source-header">Header name</Label><Input id="source-header" value={headerName} onChange={event => { setHeaderName(event.target.value); onSourceChange?.(); }} maxLength={100} disabled={blocked}/></div><div className="space-y-2"><Label htmlFor="source-api-key">Header value / API key</Label><Input id="source-api-key" type="password" autoComplete="off" value={apiKey} onChange={event => { setApiKey(event.target.value); onSourceChange?.(); }} maxLength={8192} placeholder="Bearer … or API key" disabled={blocked}/></div></div>}
    <div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={saveSource} onChange={event => { setSaveSource(event.target.checked); onSourceChange?.(); }} disabled={blocked || !canSave} className="size-4 accent-primary"/>Save this source</label><p className="mt-2 text-xs text-muted-foreground">{canSave ? 'Saved source settings and credentials are encrypted. Otherwise they are used only for this import.' : 'Fetching is available; saving requires source encryption to be configured by your administrator.'}</p></div>
    {estimate&&<ExtractionEstimate estimate={estimate} pending={blocked} onConfirm={()=>void submit(undefined,true)}/>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="submit" disabled={blocked}>{pending ? <LoaderCircle className="animate-spin"/> : <Globe/>}{pending ? 'Fetching…' : 'Fetch source'}</Button>
  </form>;
}
