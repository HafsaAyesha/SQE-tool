'use client';
import { usePathname, useRouter } from 'next/navigation';
import type { ProjectOption } from '@/lib/projects/schema';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
export function ProjectSwitcher({ projects }: { projects: ProjectOption[] }) {
  const path = usePathname();
  const router = useRouter();
  const currentId = path.match(/^\/projects\/([^/]+)/)?.[1];
  const current = projects.some(project => project.id === currentId) ? currentId : '';
  return <Select value={current} onValueChange={id => { if (id !== currentId) router.push(`/projects/${id}`); }} disabled={projects.length === 0}><SelectTrigger aria-label="Switch project" className="w-40 bg-background sm:w-56 [&_[data-slot=select-value]]:truncate"><SelectValue placeholder={projects.length ? 'Select a project' : 'No projects yet'}/></SelectTrigger><SelectContent>{projects.map(project => <SelectItem value={project.id} key={project.id}><span className="max-w-64 truncate">{project.name}</span></SelectItem>)}</SelectContent></Select>;
}
