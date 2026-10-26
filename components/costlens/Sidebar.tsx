'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FolderKanban, Upload, FileChartColumn, Settings, Sparkles } from 'lucide-react';
import { Brand } from './Brand';
import { cn } from '@/lib/utils';
const links = [{href:'/projects',label:'Projects',icon:FolderKanban},{href:'/import',label:'Import',icon:Upload},{href:'/reports',label:'Reports',icon:FileChartColumn},{href:'/settings',label:'Settings',icon:Settings}];
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <div className="flex h-full flex-col p-6"><Brand/><p className="mb-3 mt-12 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Workspace</p><nav aria-label="Main navigation" className="space-y-2">{links.map(({href,label,icon:Icon}) => {const active = pathname === href || (href === '/projects' && pathname.startsWith('/projects/')); return <Link key={href} href={href} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={cn('flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors hover:bg-muted', active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground')}><Icon className="size-5"/>{label}</Link>;})}</nav><div className="mt-auto rounded-2xl border bg-muted/50 p-4"><Sparkles className="mb-3 size-5 text-primary"/><p className="text-sm font-medium">A clearer view of costs</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Every source. One picture. Better decisions.</p></div></div>;
}
