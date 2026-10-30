'use server';
import { headers } from 'next/headers';
import { enforceRateLimit, loginIdentifier, RateLimitError, RateLimitUnavailableError } from '@/lib/security/rateLimit';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { authSchema } from '@/lib/auth/schema';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
export type AuthResult = { error?: string; message?: string; success?:boolean; status?:number; retryAfter?:number };
export async function authenticate(mode: unknown, input: unknown, redirectOnSuccess = true): Promise<AuthResult> {
  const parsedMode = z.enum(['login', 'signup']).safeParse(mode);
  const parsed = authSchema.safeParse(input);
  if (!parsedMode.success || !parsed.success || !z.boolean().safeParse(redirectOnSuccess).success) return { error: 'Enter a valid email and a password of at least 10 characters.' };
  if (!getSupabaseConfig()) return { error: 'Sign-in is not configured yet. Please contact the workspace administrator.' };
  let signedIn = false;
  try {
    await enforceRateLimit('login',loginIdentifier(await headers()));
    const supabase = await createClient();
    const { data, error } = parsedMode.data === 'login'
      ? await supabase.auth.signInWithPassword(parsed.data)
      : await supabase.auth.signUp(parsed.data);
    if (error) {
      console.error('Authentication failed', { code: error.code, status: error.status });
      return { error: parsedMode.data === 'login' ? 'Unable to sign in. Check your email and password, and confirm your email if needed.' : 'Unable to create your account. Try again later or sign in if you already have an account.' };
    }
    signedIn = Boolean(data.session);
  } catch (error) {
    if(error instanceof RateLimitError)return {error:error.message,status:429,retryAfter:error.retryAfter};
    if(error instanceof RateLimitUnavailableError)return {error:error.message,status:503};
    console.error('Authentication service unavailable');
    return { error: 'We could not reach the sign-in service. Please try again shortly.' };
  }
  if (signedIn) {if(redirectOnSuccess)redirect('/projects');return {success:true};}
  return { message: 'Check your email for a confirmation link, then return here to sign in.' };
}
export async function signOut(): Promise<AuthResult> {
  if (!getSupabaseConfig()) redirect('/');
  try {
    const supabase = await createClient();
    const {data:{user}}=await supabase.auth.getUser();if(!user)redirect('/');
    await enforceRateLimit('mutation',user.id);
    const { error } = await supabase.auth.signOut();
    if (error) return { error: 'We could not sign you out. Please try again.' };
  } catch(error) {if(typeof error==='object'&&error&&'digest'in error)throw error;if(error instanceof RateLimitError||error instanceof RateLimitUnavailableError)return {error:error.message};console.error('Sign out failed',{type:error instanceof Error?error.name:'unknown'});return { error: 'We could not reach the sign-in service. Please try again.' }; }
  redirect('/');
}
