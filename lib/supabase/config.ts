import { z } from 'zod';
const configSchema = z.object({ url: z.string().url(), anonKey: z.string().min(1) });
export function getSupabaseConfig() {
  const parsed = configSchema.safeParse({ url: process.env.NEXT_PUBLIC_SUPABASE_URL, anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY });
  return parsed.success ? parsed.data : null;
}
