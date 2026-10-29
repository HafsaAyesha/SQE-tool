import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
export function middleware(request: NextRequest) { return updateSession(request); }
// Vercel services support Node.js functions, not the default Edge middleware.
export const config = { runtime: 'nodejs', matcher: ['/projects/:path*', '/import/:path*', '/reports/:path*', '/settings/:path*', '/login', '/signup'] };
