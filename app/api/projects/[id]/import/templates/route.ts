import { NextResponse } from 'next/server';
import {withGuard} from '@/lib/security/guard';
import {rateLimitResponse} from '@/lib/security/rateLimit';
import { createClient } from '@/lib/supabase/server';
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store' };
  try {
    const { id } = await params; await withGuard(id);
    const supabase = await createClient();
    const { data: user } = await supabase.auth.getUser();
    const [templates, sources] = await Promise.all([
      supabase.from('mapping_templates').select('id,name,source_type,mapping').eq('owner_id', user.user!.id).order('created_at', { ascending: false }).limit(1000),
      supabase.from('data_sources').select('id,type,name').eq('project_id', id).order('created_at').limit(1000),
    ]);
    if (templates.error || sources.error) throw new Error('Unable to load import settings');
    return NextResponse.json({ templates: templates.data, sources: sources.data }, { headers });
  } catch (error) {
    const limited=rateLimitResponse(error);if(limited)return limited;
    console.error('Import settings read failed',{type:error instanceof Error?error.name:'unknown'});
    const missing = typeof error === 'object' && error && 'digest' in error && error.digest === 'NEXT_HTTP_ERROR_FALLBACK;404';
    return NextResponse.json({ error: missing ? 'Project not found.' : 'Could not load saved mappings.' }, { status: missing ? 404 : 500, headers });
  }
}
