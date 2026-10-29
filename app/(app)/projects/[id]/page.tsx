import { requireProject } from '@/lib/supabase/requireProject';
import { loadCostItems } from '@/lib/projects/data';
import { PageHeader } from '@/components/costlens/PageHeader';
import { ProjectActions } from '@/components/costlens/ProjectActions';
import { ProjectDashboard } from '@/components/costlens/ProjectDashboard';
import { saveCostItem, deleteCostItem } from '../actions';
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await requireProject(id);
  const rows = await loadCostItems(id);
  return <><PageHeader title={project.name} description={`${project.currency} · ${rows.length} cost ${rows.length === 1 ? 'item' : 'items'}`} action={<ProjectActions project={project} readOnly={project.readOnly}/>}/><ProjectDashboard key={id} projectId={id} rows={rows} currency={project.currency} saveAction={project.readOnly?undefined:saveCostItem.bind(null, id)} deleteAction={project.readOnly?undefined:deleteCostItem.bind(null, id)}/></>;
}
