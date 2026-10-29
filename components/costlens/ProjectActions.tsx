'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, LoaderCircle, Upload, Download } from 'lucide-react';
import { toast } from 'sonner';
import { deleteProject } from '@/app/(app)/projects/actions';
import type { ProjectOption } from '@/lib/projects/schema';
import { ProjectDialog } from './ProjectDialog';
import {useSearchParams} from 'next/navigation';
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger,DropdownMenuLabel} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
export function ProjectActions({ project }: { project: ProjectOption }) {
  const router = useRouter();const query=useSearchParams();const reportFilters=new URLSearchParams();for(const key of ['source','category','group','from','to','q']){const value=query.get(key);if(value)reportFilters.set(key,value);}const reportUrl=`/projects/${project.id}/report${reportFilters.size?'?'+reportFilters.toString():''}`;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  async function remove() {
    setPending(true);
    try {
      const result = await deleteProject(project.id);
      if (result.error) { toast.error(result.error); return; }
      toast.success('Project deleted'); setOpen(false); router.replace('/projects'); router.refresh();
    } catch { toast.error('We could not delete this project. Please try again.'); }
    finally { setPending(false); }
  }
  return <div className="flex flex-wrap gap-2"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline"><Download/>Export</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuLabel>PDF, Excel and CSV</DropdownMenuLabel><DropdownMenuItem asChild><a href={reportUrl}>Report preview and downloads</a></DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button variant="outline" asChild><a href={`/projects/${project.id}/import`}><Upload/>Import</a></Button><ProjectDialog project={project}/><Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }}><DialogTrigger asChild><Button variant="outline"><Trash2/>Delete</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Delete project?</DialogTitle><DialogDescription>“{project.name}” and all its cost items and sources will be permanently deleted. This cannot be undone.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button><Button variant="destructive" onClick={remove} disabled={pending}>{pending ? <LoaderCircle className="animate-spin"/> : <Trash2/>}Delete project</Button></DialogFooter></DialogContent></Dialog></div>;
}
