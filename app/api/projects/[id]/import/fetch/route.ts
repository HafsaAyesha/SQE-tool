import { NextResponse } from 'next/server';
import { enforceRateLimit, rateLimitResponse } from '@/lib/security/rateLimit';
import { requireProject } from '@/lib/supabase/requireProject';
import { createClient } from '@/lib/supabase/server';
import { onlineRequestSchema } from '@/lib/import/onlineSchema';
import { getAdapter } from '@/lib/import/registry';
import { parseResponseSchema } from '@/lib/import/schema';
import { PREVIEW_ROWS } from '@/lib/import/limits';
import { HtmlConfirmation } from '@/lib/import/htmlExtraction';
import { AiError } from '@/lib/ai/errors';
import { ImportError } from '@/lib/import/errors';
import { assertSourceEncryptionConfigured, encryptSourceConfig } from '@/lib/security/sourceEncryption';
export const runtime = 'nodejs';
const BODY_LIMIT = 32768;
async function body(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new ImportError('Send online source details as JSON.');
  if (Number(request.headers.get('content-length')) > BODY_LIMIT) throw new ImportError('The source configuration is too large.', 413);
  if (!request.body) throw new ImportError('Enter a source URL.');
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const result = await reader.read(); if (result.done) break; size += result.value.length; if (size > BODY_LIMIT) { await reader.cancel(); throw new ImportError('The source configuration is too large.', 413); } chunks.push(result.value); }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; } catch { throw new ImportError('The source configuration is not valid JSON.'); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const project=await requireProject(id); await enforceRateLimit('import',project.owner_id);
    const parsed = onlineRequestSchema.safeParse(await body(request));
    if (!parsed.success) throw new ImportError(parsed.error.issues[0].message);
    const input = parsed.data;
    if (input.saveSource) assertSourceEncryptionConfigured();
    let type = input.type;
    if (type === 'auto') type = new URL(input.url).hostname === 'docs.google.com' ? 'gsheets' : 'url';
    const adapter = getAdapter(type);
    if (!adapter || adapter.kind !== 'online') throw new ImportError('Choose a supported online source type.');
    const table = await adapter.parse(input.url, { headerName: input.headerName, apiKey: input.apiKey, jsonPath: input.jsonPath, tableIndex: input.tableIndex, autoDetect: input.type === 'auto',projectId:id,currency:project.currency,confirmAi:input.confirmAi });
    let sourceId: string | undefined;
    if (input.saveSource) {
      const savedType = table.meta.sourceType === 'html' ? 'html' : adapter.id;
      const encrypted = encryptSourceConfig(input, id, savedType);
      const supabase = await createClient();
      const values = { type: savedType, name: adapter.label, config_encrypted: encrypted, status: 'ready' };
      const mutation = input.sourceId ? supabase.from('data_sources').update(values).eq('project_id', id).eq('id', input.sourceId) : supabase.from('data_sources').insert({ ...values, project_id: id });
      const { data, error } = await mutation.select('id').single();
      if (error || !data) { console.error('Online source save failed', { code: error?.code }); throw new ImportError('The data was fetched, but the source could not be saved. Check the project and try again.', 500); }
      sourceId = data.id;
    }
    return NextResponse.json(parseResponseSchema.parse({ ...table, rows: new URL(request.url).searchParams.get('full') === 'true' ? table.rows : table.rows.slice(0, PREVIEW_ROWS), totalCount: table.rows.length, previewLimit: PREVIEW_ROWS, ...(sourceId ? { sourceId } : {}) }), { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if(error instanceof HtmlConfirmation)return NextResponse.json({requiresConfirmation:true,estimate:error.estimate},{status:202,headers:{'Cache-Control':'private, no-store'}});
    if(error instanceof AiError)return NextResponse.json({error:error.message},{status:error.status,headers:{'Cache-Control':'private, no-store',...(error.retryAfter?{'Retry-After':String(error.retryAfter)}:{})}});
    const limited=rateLimitResponse(error);if(limited)return limited;
    const digest = typeof error === 'object' && error !== null && 'digest' in error ? error.digest : undefined;
    const status = digest === 'NEXT_HTTP_ERROR_FALLBACK;404' ? 404 : error instanceof ImportError ? error.status : 500;
    const message = status === 404 ? 'Project not found.' : error instanceof ImportError ? error.message : 'We could not fetch this source. Please try again.';
    if (status === 500 && !(error instanceof ImportError)) console.error('Online import failed', { errorType: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: message }, { status, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
