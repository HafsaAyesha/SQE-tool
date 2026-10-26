import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
const confirmationSchema = z.object({ token_hash: z.string().min(1).max(2048), type: z.enum(['email', 'signup']) });
export async function GET(request: NextRequest) {
  const parsed = confirmationSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (parsed.success && getSupabaseConfig()) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.verifyOtp(parsed.data);
      if (!error) {
        const response = NextResponse.redirect(new URL('/projects', request.url));
        response.headers.set('Cache-Control', 'private, no-store');
        return response;
      }
    } catch { console.error('Email confirmation service unavailable'); }
  }
  const response = NextResponse.redirect(new URL('/login?confirmation=failed', request.url));
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
