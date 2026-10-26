import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from './config';
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getSupabaseConfig();
  // Route groups aren't URL segments: explicitly protect all workspace prefixes.
  const protectedRoute = /^\/(projects|import|reports|settings)(\/|$)/.test(request.nextUrl.pathname);
  if (!config) return protectedRoute ? NextResponse.redirect(new URL('/login', request.url)) : response;
  const supabase = createServerClient(config.url, config.anonKey, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    },
  } });
  const { data: { user }, error } = await supabase.auth.getUser();
  if (protectedRoute && (error || !user)) {
    const redirect = NextResponse.redirect(new URL('/login', request.url));
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    redirect.headers.set('Cache-Control', 'private, no-store');
    return redirect;
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
