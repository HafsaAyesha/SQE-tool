import { FolderOpen, type LucideIcon } from 'lucide-react';
export function EmptyState({ title, description, action, icon: Icon = FolderOpen }: { title: string; description: string; action: React.ReactNode; icon?: LucideIcon }) {
  return <div className="flex flex-col items-center rounded-2xl border border-dashed bg-card px-6 py-20 text-center"><span className="mb-5 rounded-2xl bg-accent p-4 text-accent-foreground"><Icon className="size-7" aria-hidden="true"/></span><h2 className="text-lg font-semibold">{title}</h2><p className="mb-6 mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>{action}</div>;
}
