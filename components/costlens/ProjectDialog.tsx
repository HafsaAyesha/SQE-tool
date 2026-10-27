'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';
import { createProject, renameProject } from '@/app/(app)/projects/actions';
import { currencies, projectSchema, projectNameSchema, type ProjectOption } from '@/lib/projects/schema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
export function ProjectDialog({ project, triggerLabel }: { project?: ProjectOption; triggerLabel?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project?.name ?? '');
  const [currency, setCurrency] = useState(project?.currency ?? 'USD');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = (project ? projectNameSchema : projectSchema).safeParse({ name, currency });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setPending(true); setError('');
    try {
      const result = project ? await renameProject(project.id, parsed.data) : await createProject(parsed.data);
      if (result.error) { setError(result.error); toast.error(result.error); return; }
      toast.success(project ? 'Project renamed' : 'Project created');
      setOpen(false);
      if (!project && result.id) router.push(`/projects/${result.id}`);
      router.refresh();
    } catch { setError('We could not save this project. Please try again.'); toast.error('We could not save this project. Please try again.'); }
    finally { setPending(false); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!pending) { setOpen(value); setError(''); if (value) { setName(project?.name ?? ''); setCurrency(project?.currency ?? 'USD'); } } }}>
    <DialogTrigger asChild><Button variant={project ? 'outline' : 'default'}>{project ? <Pencil/> : <Plus/>}{triggerLabel ?? (project ? 'Rename' : 'New project')}</Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>{project ? 'Rename project' : 'New project'}</DialogTitle><DialogDescription>{project ? 'Give your project a name that makes sense to you.' : 'Start with a name and the currency you’ll use to track costs.'}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div className="space-y-2"><Label htmlFor="project-name">Project name</Label><Input id="project-name" autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={120} aria-invalid={Boolean(error)} aria-describedby={error ? 'project-error' : undefined} placeholder="e.g. CodeAudit" disabled={pending}/></div>
        {!project && <div className="space-y-2"><Label htmlFor="project-currency">Currency</Label><Select value={currency} onValueChange={setCurrency} disabled={pending}><SelectTrigger id="project-currency" className="w-full"><SelectValue/></SelectTrigger><SelectContent>{currencies.map(code => <SelectItem value={code} key={code}>{code} — {new Intl.DisplayNames('en', { type: 'currency' }).of(code)}</SelectItem>)}</SelectContent></Select></div>}
        {error && <p role="alert" id="project-error" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending}>{pending && <LoaderCircle className="animate-spin"/>}{project ? 'Save name' : 'Create project'}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
