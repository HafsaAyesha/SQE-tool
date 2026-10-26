import { Sidebar } from '@/components/costlens/Sidebar';
import { TopBar } from '@/components/costlens/TopBar';
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh bg-muted/30"><a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-background focus:p-4">Skip to content</a><aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-background md:block"><Sidebar/></aside><div className="md:pl-64"><TopBar/><main id="main-content" className="mx-auto max-w-7xl space-y-8 p-4 py-8 sm:p-8 lg:p-10">{children}</main></div></div>;
}
