import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { CostTableRow } from '@/lib/costs/types';
import type { ProjectOption, ProjectSummary } from './schema';
export async function listProjects(ownerId: string) {
  const supabase = await createClient();
  const rows: ProjectSummary[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await supabase.from('project_summaries').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }).order('id').range(from, from + 999).returns<ProjectSummary[]>();
    if (error) { console.error('Project summaries failed', { code: error.code }); throw new Error('Unable to load projects. Please try again.'); }
    if (!data?.length) return rows;
    rows.push(...data);
    from += data.length;
  }
}
export async function listProjectOptions(ownerId: string) {
  const supabase = await createClient();
  const result: ProjectOption[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await supabase.from('projects').select('id, name, currency').eq('owner_id', ownerId).order('name').order('id').range(from, from + 999).returns<ProjectOption[]>();
    if (error) { console.error('Project switcher failed', { code: error.code }); throw new Error('Unable to load projects. Please try again.'); }
    if (!data?.length) return result;
    result.push(...data);
    from += data.length;
  }
}
type StoredCost = { id: string; item: string; grp: string | null; category: string | null; estimated: number | null; actual: number | null; currency: string; date: string | null; notes: string | null; source_ref: string | null; confidence: number | null; source_id: string | null; source: { name: string | null; type: string } | null };
// Caller must requireProject first. RLS also enforces ownership on each batch.
export async function loadCostItems(projectId: string): Promise<CostTableRow[]> {
  const supabase = await createClient();
  const rows: CostTableRow[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await supabase.from('cost_items').select('id,item,grp,category,estimated,actual,currency,date,notes,source_ref,confidence,source_id,source:data_sources(name,type)').eq('project_id', projectId).order('created_at').order('id').range(from, from + 999).returns<StoredCost[]>();
    if (error) { console.error('Cost rows failed', { code: error.code }); throw new Error('Unable to load cost items. Please try again.'); }
    if (!data?.length) return rows;
    rows.push(...data.map(row => ({ id: row.id, item: row.item, group: row.grp, category: row.category, estimated: row.estimated === null ? null : Number(row.estimated), actual: row.actual === null ? null : Number(row.actual), currency: row.currency, date: row.date, notes: row.notes, sourceRef: row.source_ref, confidence: row.confidence, sourceId: row.source_id, sourceName: row.source?.name ?? null, type: row.source_id === null ? 'manual' : row.source?.type ?? 'import' })));
    from += data.length;
  }
}
