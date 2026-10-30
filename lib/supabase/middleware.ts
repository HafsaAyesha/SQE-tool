import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { idSchema } from '@/lib/projects/schema';
import { getSupabaseConfig } from './config';
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = getSupabaseConfig();
  // Route groups aren't URL segments: explicitly protect all workspace prefixes.
  const protectedRoute = /^\/(projects|import|reports|settings)(\/|$)/.test(request.nextUrl.pathname);
  if (!config) return protectedRoute ? new NextResponse('CostLens is not configured yet.', { status: 503 }) : response;
  const supabase = createServerClient(config.url, config.anonKey, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
    },
  } });
  function finish(result: NextResponse) {
    response.cookies.getAll().forEach(cookie => result.cookies.set(cookie));
    result.headers.set('Cache-Control', 'private, no-store');
    return result;
  }
  // No login screens: every visitor gets a private guest (anonymous) Supabase user, so RLS ownership still applies.
  if (/^\/(login|signup)\/?$/.test(request.nextUrl.pathname)) return finish(NextResponse.redirect(new URL('/projects', request.url)));
  let { data: { user } } = await supabase.auth.getUser();
  if (protectedRoute && !user) {
    const guest = await supabase.auth.signInAnonymously();
    if (guest.error || !guest.data.user) {
      console.error('Guest sign-in failed', { code: guest.error?.code, status: guest.error?.status });
      return finish(new NextResponse('CostLens could not start a guest session. Please try again shortly.', { status: 503 }));
    }
    user = guest.data.user;
  }
  // An async notFound() inside a loading boundary can otherwise stream HTTP 200.
  // Check project URLs before rendering, while still retaining requireProject in pages/actions.
  const projectId = request.nextUrl.pathname.match(/^\/projects\/([^/]+)(?:\/|$)/)?.[1];
  function missingProject() {
    return finish(NextResponse.rewrite(new URL('/not-found', request.url), { status: 404 }));
  }
  if (user && projectId) {
    if (!idSchema.safeParse(projectId).success) return missingProject();
    const project = await supabase.from('projects').select('id').eq('id', projectId).eq('owner_id', user.id).maybeSingle();
    if (project.error) {
      console.error('Project route lookup failed', { code: project.error.code });
      return finish(new NextResponse('Unable to load this project. Please try again.', { status: 503 }));
    }
    if (!project.data) return missingProject();
  }
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
