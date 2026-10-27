import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireProject } from '@/lib/supabase/requireProject';
import { createClient } from '@/lib/supabase/server';
import { commitSchema } from '@/lib/import/commitSchema';
import { importRowSchema } from '@/lib/import/mapping';
import { escapeFormula } from '@/lib/security/sanitize';
export const runtime = 'nodejs';
const LIMIT = 16 * 1024 * 1024;
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const fail = (error: string, status = 400) => NextResponse.json({ error }, { status, headers });
  try {
    const { id } = await params; await requireProject(id);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return fail('Send confirmed rows as JSON.');
    if (Number(request.headers.get('content-length')) > LIMIT) return fail('The confirmed import is too large.', 413);
    if (!request.body) return fail('No confirmed rows were received.');
    const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > LIMIT) { await reader.cancel(); return fail('The confirmed import is too large.', 413); } chunks.push(part.value); } } finally { reader.releaseLock(); }
    let input: unknown; try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return fail('The import is not valid JSON.'); }
    const parsed = commitSchema.safeParse(input);
    if (!parsed.success) return NextResponse.json({ error: 'Some confirmed rows or import settings are invalid.', issues: parsed.error.issues.map(issue => ({ path: issue.path, message: issue.message })) }, { status: 400, headers });
    const data = parsed.data;
    const rows = data.rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'string' && ['item','group','category','notes','sourceRef'].includes(key) ? escapeFormula(value) : value])));
    if (rows.some(row => !importRowSchema.safeParse(row).success)) return fail('A formula-like text value is too long after escaping. Shorten it and retry.');
    const supabase = await createClient();
    const { data: result, error } = await supabase.rpc('commit_cost_import', { p_project: id, p_source: data.source.id ?? null, p_type: data.source.type, p_name: escapeFormula(data.source.name), p_mapping: { columns: data.columns, mapping: data.mapping, currency: data.currency, decimal: data.decimal }, p_mode: data.mode, p_rows: rows, p_template_name: data.templateName ? escapeFormula(data.templateName) : null });
    if (error) { console.error('Import transaction failed', { code: error.code }); return fail('The import could not be saved. Check the source selection and database migrations, then retry.', 400); }
    revalidatePath('/projects'); revalidatePath(`/projects/${id}`);
    return NextResponse.json(result, { headers });
  } catch (error) {
    if (typeof error === 'object' && error && 'digest' in error && error.digest === 'NEXT_HTTP_ERROR_FALLBACK;404') return fail('Project not found.', 404);
    console.error('Import commit failed', { errorType: error instanceof Error ? error.name : 'unknown' });
    return fail('We could not save this import. Please try again.', 500);
  }
}
