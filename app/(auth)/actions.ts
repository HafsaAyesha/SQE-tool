'use server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { authSchema } from '@/lib/auth/schema';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
export type AuthResult = { error?: string; message?: string };
export async function authenticate(mode: unknown, input: unknown): Promise<AuthResult> {
  const parsedMode = z.enum(['login', 'signup']).safeParse(mode);
  const parsed = authSchema.safeParse(input);
  if (!parsedMode.success || !parsed.success) return { error: 'Enter a valid email and a password of at least 10 characters.' };
  if (!getSupabaseConfig()) return { error: 'Sign-in is not configured yet. Please contact the workspace administrator.' };
  let signedIn = false;
  try {
    const supabase = await createClient();
    const { data, error } = parsedMode.data === 'login'
      ? await supabase.auth.signInWithPassword(parsed.data)
      : await supabase.auth.signUp(parsed.data);
    if (error) {
      console.error('Authentication failed', { code: error.code, status: error.status });
      return { error: parsedMode.data === 'login' ? 'Unable to sign in. Check your email and password, and confirm your email if needed.' : 'Unable to create your account. Try again later or sign in if you already have an account.' };
    }
    signedIn = Boolean(data.session);
  } catch {
    console.error('Authentication service unavailable');
    return { error: 'We could not reach the sign-in service. Please try again shortly.' };
  }
  if (signedIn) redirect('/projects');
  return { message: 'Check your email for a confirmation link, then return here to sign in.' };
}
export async function signOut(): Promise<AuthResult> {
  if (!getSupabaseConfig()) redirect('/login');
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) return { error: 'We could not sign you out. Please try again.' };
  } catch { return { error: 'We could not reach the sign-in service. Please try again.' }; }
  redirect('/login');
}
