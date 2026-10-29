import 'server-only';
import {isDemoUser} from '@/lib/demo/access';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { createClient } from './server';
export async function requireProject(projectId: string) {
  if (!z.string().uuid().safeParse(projectId).success) notFound();
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) notFound();
  const { data, error } = await supabase.from('projects').select('id, owner_id, name, currency, created_at').eq('id', projectId).eq('owner_id', user.id).maybeSingle();
  if (error) { console.error('Project lookup failed', { code: error.code }); throw new Error('Unable to load this project. Please try again.'); }
  if (!data) notFound();
  return {...data,readOnly:isDemoUser(user)};
}
