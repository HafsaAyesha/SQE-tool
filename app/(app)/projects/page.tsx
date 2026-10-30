import {isDemoUser} from '@/lib/demo/access';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { listProjects } from '@/lib/projects/data';
import { PageHeader } from '@/components/costlens/PageHeader';
import { EmptyState } from '@/components/costlens/EmptyState';
import { ProjectDialog } from '@/components/costlens/ProjectDialog';
import { ProjectCard } from '@/components/costlens/ProjectCard';
export default async function ProjectsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/');
  const projects = await listProjects(user.id);
  return <><PageHeader title="Your projects" description="Big picture clarity. Down to the last detail." action={isDemoUser(user)?undefined:<ProjectDialog/>}/>{projects.length === 0 ? <EmptyState title="Create your first project" description="Give your costs a home. Start a project, add your estimates and actuals, and see the full picture." action={<ProjectDialog triggerLabel="Create your first project"/>}/> : <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{projects.map(project => <ProjectCard key={project.id} project={project}/>)}</div>}</>;
}
