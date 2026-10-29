import { requireProject } from '@/lib/supabase/requireProject';
import { adapterDescriptors } from '@/lib/import/registry';
import { sourceEncryptionReady } from '@/lib/security/sourceEncryption';
import { PageHeader } from '@/components/costlens/PageHeader';
import { ImportWizard } from '@/components/costlens/ImportWizard';
export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await requireProject(id);
  return <><PageHeader title="Import cost data" description={`Bring cost data from files, documents or a link into ${project.name}.`}/><ImportWizard projectId={id} currency={project.currency} adapters={adapterDescriptors()} canSaveSources={sourceEncryptionReady()}/></>;
}
