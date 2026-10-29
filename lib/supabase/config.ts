import { z } from 'zod';
import { normalizeSupabaseUrl } from './url';
const configSchema = z.object({ url: z.string().url(), anonKey: z.string().min(1) });
export function getSupabaseConfig() {
  const parsed = configSchema.safeParse({ url: normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL) ?? undefined, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() });
  return parsed.success ? parsed.data : null;
}
