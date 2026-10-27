import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireProject } from '@/lib/supabase/requireProject';
import { getAdapter, getAdapterFor } from '@/lib/import/registry';
import { ImportError } from '@/lib/import/errors';
import { parseOptionsSchema, parseResponseSchema } from '@/lib/import/schema';
import { MAX_DOCUMENT_BYTES, PREVIEW_ROWS } from '@/lib/import/limits';
export const runtime = 'nodejs';
const bodyLimit = MAX_DOCUMENT_BYTES + 64 * 1024;
async function boundedBody(request: Request) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > bodyLimit)) throw new ImportError('Documents must be 10 MB or smaller.', 413);
  if (!request.body) throw new ImportError('Choose a file or paste data before importing.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > bodyLimit) { await reader.cancel(); throw new ImportError('Documents must be 10 MB or smaller.', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requireProject(id);
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data;')) throw new ImportError('Send a file using the upload or paste form.');
    let form: FormData;
    try { form = await new Response(await boundedBody(request), { headers: { 'content-type': contentType } }).formData(); }
    catch (error) { if (error instanceof ImportError) throw error; throw new ImportError('The upload was incomplete or invalid. Choose the file again.'); }
    const file = form.get('file');
    if (!(file instanceof File) || form.getAll('file').length !== 1) throw new ImportError('Choose exactly one file to import.');
    const options = parseOptionsSchema.safeParse({ sheet: form.get('sheet') ?? undefined, jsonPath: form.get('jsonPath') ?? undefined });
    const adapterId = z.string().regex(/^[a-z][a-z0-9-]{0,79}$/).optional().safeParse(form.get('adapterId') ?? undefined);
    if (!options.success || !adapterId.success) throw new ImportError('The selected source options are invalid.');
    // Detection inspects signatures and ZIP expansion; every adapter's parse is independently guarded.
    const adapter = adapterId.data ? getAdapter(adapterId.data) : await getAdapterFor(file);
    if (!adapter) throw new ImportError('This format is not supported yet. Choose CSV, TSV, text, Excel, ODS, JSON or XML.');
    const table = await adapter.parse(file, options.data);
    const result = parseResponseSchema.parse({ ...table, rows: form.get('full') === 'true' ? table.rows : table.rows.slice(0, PREVIEW_ROWS), totalCount: table.rows.length, previewLimit: PREVIEW_ROWS });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const digest = typeof error === 'object' && error !== null && 'digest' in error ? error.digest : undefined;
    if (digest === 'NEXT_HTTP_ERROR_FALLBACK;404') return NextResponse.json({ error: 'Project not found.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
    if (error instanceof ImportError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } });
    console.error('Import request failed', { errorType: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'We could not import this file. Please try again.' }, { status: 500, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
