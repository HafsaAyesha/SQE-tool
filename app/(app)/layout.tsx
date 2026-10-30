import {isDemoUser} from '@/lib/demo/access';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseConfig } from '@/lib/supabase/config';
import { listProjectOptions } from '@/lib/projects/data';
import { Sidebar } from '@/components/costlens/Sidebar';
import { TopBar } from '@/components/costlens/TopBar';
export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!getSupabaseConfig()) redirect('/');
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect('/');
  const projects = await listProjectOptions(user.id);
  return <div className="min-h-svh bg-muted/30"><a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-4">Skip to content</a><aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-background md:block"><Sidebar/></aside><div className="md:pl-64"><TopBar email={user.is_anonymous ? 'Guest workspace' : user.email ?? 'Account'} guest={Boolean(user.is_anonymous)} projects={projects}/><main id="main-content" className="mx-auto max-w-7xl space-y-8 p-4 py-8 sm:p-8 lg:p-10">{isDemoUser(user)&&<div className="rounded-xl border border-primary/25 bg-accent p-4 text-sm">Public demo · Synthetic sample data · Read-only. Sign out from the user menu to start your own workspace, where you can import and edit costs.</div>}{children}</main></div></div>;
}
