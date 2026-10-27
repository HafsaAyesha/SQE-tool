import { Skeleton } from '@/components/ui/skeleton';
export function DashboardSkeleton() {
  return <div role="status" aria-label="Loading project dashboard" className="space-y-6"><span className="sr-only">Loading project dashboard…</span><Skeleton className="h-36 rounded-2xl"/><div className="grid grid-cols-2 gap-3 xl:grid-cols-5">{Array.from({length:5},(_,index)=><Skeleton key={index} className="h-36 rounded-2xl last:col-span-2 xl:last:col-span-1"/>)}</div><div className="grid gap-6 lg:grid-cols-2">{Array.from({length:4},(_,index)=><Skeleton key={index} className="h-96 rounded-2xl"/>)}</div><Skeleton className="h-80 rounded-2xl"/></div>;
}
