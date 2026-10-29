'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireProject } from '@/lib/supabase/requireProject';
import { idSchema, projectNameSchema, projectSchema } from '@/lib/projects/schema';
import { cleanupProjectMedia } from '@/lib/media/server';
import { costInputSchema } from '@/lib/costs/schema';
export type MutationResult = { error?: string; id?: string; success?: boolean };
function refresh(projectId?: string) {
  revalidatePath('/projects');
  revalidatePath('/', 'layout');
  if (projectId) revalidatePath(`/projects/${projectId}`);
}
function failure(operation: string, code?: string): MutationResult {
  console.error('Project mutation failed', { operation, code });
  return { error: 'We could not save this change. Please try again.' };
}
export async function createProject(input: unknown): Promise<MutationResult> {
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: 'Please sign in to create a project.' };
  const { data, error } = await supabase.from('projects').insert({ ...parsed.data, owner_id: user.id }).select('id').single();
  if (error || !data) return failure('create project', error?.code);
  refresh();
  return { success: true, id: data.id };
}
export async function renameProject(projectId: string, input: unknown): Promise<MutationResult> {
  const project = await requireProject(projectId);
  const parsed = projectNameSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from('projects').update(parsed.data).eq('id', projectId).eq('owner_id', project.owner_id).select('id').maybeSingle();
  if (error || !data) return failure('rename project', error?.code);
  refresh(projectId);
  return { success: true };
}
export async function deleteProject(projectId: string): Promise<MutationResult> {
  const project = await requireProject(projectId);
  try{await cleanupProjectMedia(projectId);}catch{return {error:'Private recordings could not be deleted. Please retry before deleting the project.'};}
  const supabase = await createClient();
  const { data, error } = await supabase.from('projects').delete().eq('id', projectId).eq('owner_id', project.owner_id).select('id').maybeSingle();
  if (error || !data) return failure('delete project', error?.code);
  refresh(projectId);
  return { success: true };
}
export async function saveCostItem(projectId: string, rowId: string | null, input: unknown): Promise<MutationResult> {
  const project = await requireProject(projectId);
  const parsed = costInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (rowId !== null && !idSchema.safeParse(rowId).success) return { error: 'Invalid row identifier.' };
  const supabase = await createClient();
  const { group, ...values } = parsed.data;
  const payload = { ...values, grp: group };
  const query = rowId === null
    ? supabase.from('cost_items').insert({ ...payload, project_id: projectId, currency: project.currency, source_id: null })
    : supabase.from('cost_items').update(payload).eq('id', rowId).eq('project_id', projectId);
  const { data, error } = await query.select('id').maybeSingle();
  if (error || !data) return failure('save cost item', error?.code);
  refresh(projectId);
  return { success: true, id: data.id };
}
export async function deleteCostItem(projectId: string, rowId: string): Promise<MutationResult> {
  await requireProject(projectId);
  if (!idSchema.safeParse(rowId).success) return { error: 'Invalid row identifier.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('cost_items').delete().eq('id', rowId).eq('project_id', projectId).select('id').maybeSingle();
  if (error || !data) return failure('delete cost item', error?.code);
  refresh(projectId);
  return { success: true };
}
